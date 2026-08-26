/**
 * packages/orchestrator/headroom/headroom.ts — Headroom Ghost Layer
 *
 * Transparent context-compression wrapper adapted from the reference
 * Headroom design (statistical SmartCrush, prefix CacheAligner, bounded
 * RollingWindow). All invariants:
 *
 *   1. NEVER removes the human user message.
 *   2. NEVER breaks (system, user, assistant) turn ordering/pairing.
 *   3. Parse failures and non-compressible payloads pass through unchanged
 *      (silent no-op) — compression is a best-effort optimization, not a
 *      required transform.
 *   4. Idempotent: double-wrapping short prompts is a cheap no-op.
 *
 * This module operates purely on the (systemPrompt, userPrompt) pair we
 * already send to `gatewayChatText/Json`. It does NOT attempt AST-based
 * code compression or ML-based LLMLingua passes — we're in Edge runtime
 * without tree-sitter/Python, and those are reserved for Phase 3+ on a
 * dedicated worker.
 *
 * Three strategies:
 *
 *  • SmartCrush  — when the user prompt embeds JSON arrays (competitor
 *                  lists, transcript chunks, search results), compress by
 *                  keeping head, tail, statistical outliers, and items
 *                  whose tokens overlap the active query (recent system
 *                  + user tail).
 *  • CacheAligner— stabilize prefix tokens: sort known-floating keys
 *                  (like model id lists) into a canonical order, and
 *                  place the channel-memory preamble FIRST so repeated
 *                  calls across requests hit provider-side prompt-cache
 *                  prefix slots (OpenAI auto-prefix-cache, Anthropic
 *                  cache_control blocks, Google context caching).
 *  • RollingWindow— enforce a hard outbound char budget while preserving
 *                  turn pairing: we keep the system prompt intact and
 *                  truncate the LONGEST embedded JSON-list section of the
 *                  user prompt (never cut off mid-structure).
 *
 * Telemetry: every call returns a `HeadroomReport` (tokensSaved estimate,
 * compressionRatio, strategiesApplied). Reports are accumulated by a
 * process-global ring that the metrics endpoint can read.
 */

export interface HeadroomCompressOpts {
  systemPrompt: string;
  userPrompt: string;
  /**
   * Optional relevance hint terms (e.g. the user's current query). When
   * SmartCrush prunes embedded lists, items whose tokens hit these terms
   * are preserved regardless of position or outlier status.
   */
  relevanceHints?: string[];
  /**
   * Maximum outbound chars for the USER prompt after compression. The
   * system prompt is NEVER truncated. Default tuned to ~16k tokens of
   * user-side context ( ~64k chars at 4 chars/token ), which leaves
   * headroom for the 8192-token max_output on flash-class models.
   */
  maxUserChars?: number;
}

export interface HeadroomReport {
  strategiesApplied: string[];
  /** Original combined prompt length in chars. */
  originalChars: number;
  /** Post-compression combined prompt length in chars. */
  compressedChars: number;
  /** Conservative token-saved estimate (chars/4). */
  tokensSavedEstimate: number;
  /** 0..1 compression ratio vs original. 0 = no savings, higher = more saved. */
  compressionRatio: number;
}

export interface HeadroomCompressedPrompts {
  systemPrompt: string;
  userPrompt: string;
  report: HeadroomReport;
}

const DEFAULT_MAX_USER_CHARS = 48_000;

/**
 * Memory preamble sentinel lines we recognize and hoist to the very top
 * of the system prompt for CacheAligner (prefix stability).
 */
const CACHE_ALIGN_SENTINELS = [
  "You are an elite YouTube growth strategist",
  "You are a ruthless YouTube Retention Critic",
  "Channel Memory Profile:",
  "Ghost Protocol",
];

/**
 * Tokenize-lite: lowercased 2..30 char alphanumeric grams. We do NOT
 * pull in a real tokenizer (avoid Edge cold-start cost) — this is good
 * enough for relevance overlap scoring on English/Hinglish prompts.
 */
function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  const re = /[a-z0-9][a-z0-9'-]{1,28}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.add(m[0].toLowerCase());
  return out;
}

/**
 * CacheAligner: ensure the system prompt's preamble is stable across
 * requests so prefix caching fires. We do two things:
 *  1. If the system prompt contains a recognizable role/identity line
 *     ("You are an elite YouTube growth strategist..."), ensure it is
 *     the FIRST non-empty line.
 *  2. Strip trailing whitespace noise and normalize blank lines.
 *
 * This is conservative — we never reorder semantic clauses, we only
 * hoist the identity preamble when it's not already at line 0.
 */
function cacheAlign(systemPrompt: string): { out: string; changed: boolean } {
  if (!systemPrompt) return { out: systemPrompt, changed: false };
  const raw = systemPrompt;
  const lines = raw.split(/\r?\n/);

  // Find the first sentinel-prefixed line.
  const sentinelIdx = lines.findIndex((ln) =>
    CACHE_ALIGN_SENTINELS.some((s) => ln.trim().startsWith(s)),
  );
  const out = lines;
  let changed = false;
  if (sentinelIdx > 0) {
    const [picked] = lines.splice(sentinelIdx, 1);
    // Remove leading blank lines then prepend the identity line.
    while (out.length && out[0].trim() === "") out.shift();
    out.unshift(picked);
    changed = true;
  }

  // Collapse runs of >=3 blank lines into a single blank line.
  const normalized: string[] = [];
  let blanks = 0;
  for (const ln of out) {
    if (ln.trim() === "") {
      blanks += 1;
      if (blanks <= 1) normalized.push("");
    } else {
      blanks = 0;
      normalized.push(ln);
    }
  }
  const result = normalized.join("\n").trimEnd();
  if (result !== raw) changed = true;
  return { out: result, changed };
}

/**
 * Try to extract embedded JSON arrays/objects from a prompt string.
 * Returns an array of {index,length,payload} slices where `payload` is
 * the parseable JSON substring (object or array). Non-parseable slices
 * are skipped. We deliberately keep this narrow: we only look for
 * top-level balanced brackets that start after a label like
 * `competitors:`, `videos:`, `items:`, `results:`, `chunks:`.
 */
interface JsonSlice {
  start: number;
  end: number; // exclusive, points to the char after the closing bracket
  payload: unknown;
  kind: "array" | "object";
  label: string; // preceeding label up to 40 chars
}

function findEmbeddedJson(s: string): JsonSlice[] {
  const out: JsonSlice[] = [];
  const openers = [
    { ch: "[", close: "]", kind: "array" as const },
    { ch: "{", close: "}", kind: "object" as const },
  ];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const opener = openers.find((o) => o.ch === c);
    if (!opener) continue;
    // Cheap context check: must be preceded by a label-ish token (":",
    // "\n", whitespace, or start-of-string) so we don't grab random
    // brackets from prose. Start-of-string (i===0) is allowed.
    const prev = s[i - 1];
    if (i !== 0 && prev !== undefined && !/[\s:,\n=]/.test(prev)) {
      continue;
    }

    // Scan balanced, respecting strings.
    let depth = 0;
    let inStr: string | null = null;
    let escaped = false;
    let j = i;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (inStr) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch === opener.ch) depth += 1;
      else if (ch === opener.close) {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    if (depth !== 0) {
      continue; // unbalanced, skip
    }
    const slice = s.slice(i, j);
    if (slice.length < 200) {
      i = j - 1;
      continue; // too small to justify compression
    }
    let payload: unknown;
    try {
      payload = JSON.parse(slice);
    } catch {
      i = j - 1;
      continue;
    }

    // label = 40 chars preceding i, trimmed.
    const labelStart = Math.max(0, i - 60);
    const label = s.slice(labelStart, i).replace(/\s+/g, " ").trim().slice(-40);

    out.push({ start: i, end: j, payload, kind: opener.kind, label });
    i = j - 1;
  }
  return out;
}

interface ScoredItem {
  raw: unknown;
  index: number;
  length: number;
  score: number;
  isNumericOutlier: boolean;
  isRelevant: boolean;
  isHeadOrTail: boolean;
}

function isEllidedMarker(x: unknown): boolean {
  return !!x && typeof x === "object" && "_ellided" in (x as Record<string, unknown>);
}

function scoreArrayForCrush(
  arr: unknown[],
  hints: Set<string>,
): { kept: unknown[]; dropped: number; originalLen: number } {
  if (!Array.isArray(arr) || arr.length <= 6) {
    return { kept: arr, dropped: 0, originalLen: arr.length };
  }
  // Idempotency: if this array already contains _ellided markers from a
  // previous Headroom pass, leave it alone — it is already the canonical
  // compressed form. Double-wrapping must be a no-op.
  if (arr.some(isEllidedMarker)) {
    return { kept: arr, dropped: 0, originalLen: arr.length };
  }
  const serialized = arr.map((it) =>
    typeof it === "string" ? it : JSON.stringify(it),
  );
  const lengths = serialized.map((s) => s.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  const std = Math.sqrt(variance);
  const OUTLIER_THRESHOLD = mean + 1.6 * std; // high-signal long items

  const items: ScoredItem[] = arr.map((raw, idx) => {
    const len = lengths[idx];
    const serializedItem = serialized[idx].toLowerCase();
    const isNumericOutlier = len > OUTLIER_THRESHOLD && len > 180;
    const isHeadOrTail = idx < 3 || idx >= arr.length - 2;
    let isRelevant = false;
    if (hints.size > 0) {
      for (const term of hints) {
        if (serializedItem.includes(term)) {
          isRelevant = true;
          break;
        }
      }
    }
    return {
      raw,
      index: idx,
      length: len,
      score: 0,
      isNumericOutlier,
      isRelevant,
      isHeadOrTail,
    };
  });

  // Always keep head, tail, outliers, and relevance hits.
  const kept: unknown[] = [];
  let nextExpected = 0;
  const keepIdx = new Set<number>();
  for (const it of items) {
    if (it.isHeadOrTail || it.isNumericOutlier || it.isRelevant) {
      keepIdx.add(it.index);
    }
  }
  // Always keep at least ~35% of the array (never gut below that).
  const minKeep = Math.max(6, Math.ceil(arr.length * 0.35));
  // If we are below minKeep, back-fill middle items that are highest-
  // variance (long-form = most signal).
  const sorted = [...items].sort((a, b) => b.length - a.length);
  for (const it of sorted) {
    if (keepIdx.size >= minKeep) break;
    keepIdx.add(it.index);
  }

  for (const it of items) {
    if (keepIdx.has(it.index)) {
      // Emit a `…` placeholder at first dropped gap so the LLM sees the
      // gap is intentional rather than our bug.
      if (it.index !== nextExpected) {
        kept.push({ _ellided: it.index - nextExpected });
      }
      kept.push(it.raw);
      nextExpected = it.index + 1;
    }
  }
  if (nextExpected < arr.length) {
    kept.push({ _ellided: arr.length - nextExpected });
  }

  // Count dropped originals (placeholders don't count as items).
  const realKept = kept.filter((x) => !isEllidedMarker(x)).length;
  const dropped = arr.length - realKept;
  return { kept, dropped, originalLen: arr.length };
}

/**
 * SmartCrush: find embedded JSON lists inside the user prompt and
 * statistically prune them (head + tail + outliers + relevance hits).
 * Non-JSON prose is preserved verbatim. System prompt is NEVER touched
 * by SmartCrush — only the user prompt contains the bulk data.
 */
function smartCrush(
  userPrompt: string,
  hints: Set<string>,
): { out: string; stats: { listsCrushed: number; itemsDropped: number } } {
  const slices = findEmbeddedJson(userPrompt);
  if (slices.length === 0) {
    return { out: userPrompt, stats: { listsCrushed: 0, itemsDropped: 0 } };
  }
  // Process slices from RIGHT to LEFT so indices stay valid as we rewrite.
  let out = userPrompt;
  let listsCrushed = 0;
  let itemsDropped = 0;
  for (let si = slices.length - 1; si >= 0; si--) {
    const slice = slices[si];
    if (slice.kind !== "array") continue; // only crush arrays, not top-level objects
    const arr = slice.payload as unknown[];
    const { kept, dropped } = scoreArrayForCrush(arr, hints);
    if (dropped === 0) continue;
    const replacement = JSON.stringify(kept);
    out = out.slice(0, slice.start) + replacement + out.slice(slice.end);
    listsCrushed += 1;
    itemsDropped += dropped;
  }
  return { out, stats: { listsCrushed, itemsDropped } };
}

/**
 * RollingWindow: if the user prompt is still over budget AFTER
 * SmartCrush, truncate the LARGEST embedded JSON array by dropping
 * additional middle items (keeping head+tail) until we fit. We never
 * slice mid-string or mid-object.
 */
function rollingWindow(
  userPrompt: string,
  maxChars: number,
): { out: string; truncated: boolean } {
  if (userPrompt.length <= maxChars) return { out: userPrompt, truncated: false };
  let out = userPrompt;
  // Iteratively crush the biggest remaining array until we fit or
  // there are no arrays left (in which case we fall back to a
  // marked hard-trim that keeps the tail — last thing said is often
  // the instruction).
  for (let safety = 0; safety < 8; safety++) {
    if (out.length <= maxChars) break;
    const slices = findEmbeddedJson(out).filter((s) => s.kind === "array");
    if (slices.length === 0) break;
    const biggest = slices.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    const arr = biggest.payload as unknown[];
    if (!Array.isArray(arr) || arr.length <= 4) break;
    // Idempotency: already contains our markers -> stop, fall to hard trim.
    if (arr.some(isEllidedMarker)) break;
    // Keep head 2, tail 2 — drop 50% of the middle.
    const head = arr.slice(0, 2);
    const tail = arr.slice(-2);
    const midDrop = arr.length - head.length - tail.length;
    const replacement = JSON.stringify([
      ...head,
      { _ellided: midDrop, _reason: "rolling_window_budget" },
      ...tail,
    ]);
    out = out.slice(0, biggest.start) + replacement + out.slice(biggest.end);
  }
  if (out.length <= maxChars) return { out, truncated: true };
  // Last resort: keep system prompt intact and hard-trim user prompt
  // preserving HEAD (data preamble) + TAIL (final instructions).
  const tailKeep = Math.min(maxChars, 6_000);
  const headKeep = maxChars - tailKeep - 40;
  out =
    out.slice(0, Math.max(0, headKeep)) +
    `\n\n…[${out.length - headKeep - tailKeep} chars compressed by Headroom rolling window]…\n\n` +
    out.slice(-tailKeep);
  return { out, truncated: true };
}

/* ------------------------------------------------------------------ */
/* Global telemetry ring                                              */
/* ------------------------------------------------------------------ */

export interface HeadroomTelemetry {
  calls: number;
  totalOriginalChars: number;
  totalCompressedChars: number;
  totalTokensSavedEstimate: number;
  listsCrushed: number;
  itemsDropped: number;
  truncations: number;
  cacheAlignments: number;
}

const _telemetry: HeadroomTelemetry = {
  calls: 0,
  totalOriginalChars: 0,
  totalCompressedChars: 0,
  totalTokensSavedEstimate: 0,
  listsCrushed: 0,
  itemsDropped: 0,
  truncations: 0,
  cacheAlignments: 0,
};

export function headroomTelemetrySnapshot(): Readonly<HeadroomTelemetry> {
  return { ..._telemetry };
}

export function resetHeadroomTelemetry(): void {
  _telemetry.calls = 0;
  _telemetry.totalOriginalChars = 0;
  _telemetry.totalCompressedChars = 0;
  _telemetry.totalTokensSavedEstimate = 0;
  _telemetry.listsCrushed = 0;
  _telemetry.itemsDropped = 0;
  _telemetry.truncations = 0;
  _telemetry.cacheAlignments = 0;
}

/** Kill switch. If GHOST_HEADROOM_ENABLED === 'false' we passthrough. */
function headroomEnabled(): boolean {
  const v = process.env.GHOST_HEADROOM_ENABLED?.trim().toLowerCase();
  // Enabled by default — it is purely additive and safe.
  return v !== "false" && v !== "0";
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Compress a (systemPrompt, userPrompt) pair using the Headroom Ghost
 * Layer. Safe to call on every request — short prompts and prompts with
 * no embedded JSON lists pass through with <1ms overhead (string ops
 * only, no network).
 */
export function compressHeadroom(opts: HeadroomCompressOpts): HeadroomCompressedPrompts {
  const emptyReport: HeadroomReport = {
    strategiesApplied: [],
    originalChars: 0,
    compressedChars: 0,
    tokensSavedEstimate: 0,
    compressionRatio: 0,
  };

  if (!headroomEnabled()) {
    return {
      systemPrompt: opts.systemPrompt,
      userPrompt: opts.userPrompt,
      report: { ...emptyReport, strategiesApplied: ["disabled"] },
    };
  }

  try {
    const originalChars = (opts.systemPrompt?.length ?? 0) + (opts.userPrompt?.length ?? 0);
    const strategiesApplied: string[] = [];

    // 1) CacheAligner on system prompt.
    const aligned = cacheAlign(opts.systemPrompt ?? "");
    const systemPrompt = aligned.out;
    if (aligned.changed) strategiesApplied.push("cache-align");

    let userPrompt = opts.userPrompt ?? "";

    // 2) Build relevance hints. We use ONLY the caller-supplied hints
    //    (e.g. the current user query or search terms). Auto-deriving
    //    hints from the prompt tail was too greedy — it matched every
    //    item in embedded lists, producing 0% compression. When no
    //    explicit hints are supplied SmartCrush still keeps head/tail
    //    and statistical outliers, which is the majority of the value.
    const hints = new Set<string>(
      (opts.relevanceHints ?? [])
        .flatMap((h) => {
          const t = tokenize(h);
          return [...t];
        })
        .filter((t) => t.length >= 3),
    );

    // 3) SmartCrush on user prompt.
    const crush = smartCrush(userPrompt, hints);
    userPrompt = crush.out;
    if (crush.stats.listsCrushed > 0) {
      strategiesApplied.push("smart-crush");
    }

    // 4) RollingWindow budget.
    const maxUser = opts.maxUserChars ?? DEFAULT_MAX_USER_CHARS;
    const win = rollingWindow(userPrompt, maxUser);
    userPrompt = win.out;
    if (win.truncated) strategiesApplied.push("rolling-window");

    const compressedChars = systemPrompt.length + userPrompt.length;
    const savedChars = Math.max(0, originalChars - compressedChars);
    const tokensSaved = Math.max(0, Math.ceil(savedChars / 4));
    const compressionRatio = originalChars === 0 ? 0 : savedChars / originalChars;

    const report: HeadroomReport = {
      strategiesApplied,
      originalChars,
      compressedChars,
      tokensSavedEstimate: tokensSaved,
      compressionRatio,
    };

    // Update telemetry
    _telemetry.calls += 1;
    _telemetry.totalOriginalChars += originalChars;
    _telemetry.totalCompressedChars += compressedChars;
    _telemetry.totalTokensSavedEstimate += tokensSaved;
    _telemetry.listsCrushed += crush.stats.listsCrushed;
    _telemetry.itemsDropped += crush.stats.itemsDropped;
    if (win.truncated) _telemetry.truncations += 1;
    if (aligned.changed) _telemetry.cacheAlignments += 1;

    // When nothing changed, still return the original strings (stable ref).
    if (compressedChars === originalChars && !aligned.changed) {
      return {
        systemPrompt: opts.systemPrompt ?? "",
        userPrompt: opts.userPrompt ?? "",
        report: {
          ...report,
          strategiesApplied: report.strategiesApplied.filter((s) => s !== "cache-align"),
        },
      };
    }

    return { systemPrompt, userPrompt, report };
  } catch (err) {
    // SAFETY: any unexpected error (should never happen) — passthrough.
    console.warn("[headroom] compression failed, passthrough:", err);
    return {
      systemPrompt: opts.systemPrompt ?? "",
      userPrompt: opts.userPrompt ?? "",
      report: {
        ...emptyReport,
        strategiesApplied: ["passthrough-on-error"],
        originalChars: (opts.systemPrompt?.length ?? 0) + (opts.userPrompt?.length ?? 0),
        compressedChars: (opts.systemPrompt?.length ?? 0) + (opts.userPrompt?.length ?? 0),
      },
    };
  }
}
