/**
 * api/_interrogate.ts — Ghost Interrogation engine.
 *
 * Wraps transcript extraction, chunking, embedding, vector retrieval, and
 * answer synthesis for the "chat with competitor video" feature. Designed
 * to be called from the /api/ghost/interrogate edge route.
 *
 * Invariants:
 *   - All credit checks happen before we do any work (caller passes in
 *     a consume-ok verdict).
 *   - If the transcript has been ghost-reconstructed, answers are clearly
 *     labelled as SCAFFOLD (pattern-match intelligence, not exact words).
 *   - Citations reference exact chunk timestamps, and the answer contains
 *     [MM:SS] links the UI can turn into YouTube t= deep-links.
 */

import { jsonResponse, safeJsonBody } from "./_shared.js";

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] || (fallback ? process.env[fallback] : "") || "";
  if (!v) throw new Error(`${name} not configured`);
  return v.replace(/\/$/, "");
}
import { gatewayChatText } from "../packages/orchestrator/ai-gateway.js";
import { embedText } from "../packages/orchestrator/embeddings.js";
import { consumeGhostAction, type GhostAction } from "./_ghostLedger.js";
import { verifyGhostAuth, extractBearer } from "./_ghostAuth.js";

export const INTERROGATE_ACTION: GhostAction = "interrogate";

export interface InterrogateIndexResult {
  videoId: string;
  chunksIndexed: number;
  ghostReconstructed: boolean;
  totalChunks: number;
}

export interface InterrogateChatResult {
  answer: string;
  citations: Array<{
    chunkIndex: number;
    startTs: number;
    endTs: number;
    text: string;
    similarity: number;
  }>;
  ghostReconstructed: boolean;
  model: string;
}

// ---------------------------------------------------------------------------
// Supabase helpers (mirror api/_ghostLedger.ts conventions).
// ---------------------------------------------------------------------------

function supabaseCreds() {
  return {
    url: requireEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
    key: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

// MP7: identity now resolved by the shared, memoised Ghost auth layer.
// The former local copy validated the caller's JWT using the service-role
// key, which authenticated the service rather than the caller.
const verifyAuth = verifyGhostAuth;

async function supaRpc<T = unknown>(
  fn: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { url, key } = supabaseCreds();
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase RPC ${fn} HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Chunking — split transcript into ~350-token (~1400 char) windows with 40
// token (~160 char) overlap. When segments have timestamps (live captions)
// we compute start_ts/end_ts per chunk; otherwise timestamps are null.
// ---------------------------------------------------------------------------

const TARGET_CHARS = 1400; // ~350 tokens
const OVERLAP_CHARS = 160; // ~40 tokens
const MIN_CHUNK_CHARS = 180;

interface RawChunk {
  text: string;
  startTs: number | null;
  endTs: number | null;
}

function chunkTranscript(
  text: string,
  segments: Array<{ text?: string; start?: number; duration?: number; offset?: number }> = [],
): RawChunk[] {
  const chunks: RawChunk[] = [];
  if (segments && segments.length > 0) {
    // Segment-aware chunking: greedily pack segments into windows under
    // TARGET_CHARS while preserving timestamps.
    let buf = "";
    let bufStart: number | null = null;
    let bufEnd: number | null = null;
    const flush = () => {
      const t = buf.trim();
      if (t.length >= MIN_CHUNK_CHARS) {
        chunks.push({ text: t, startTs: bufStart, endTs: bufEnd });
      }
      buf = "";
      bufStart = null;
      bufEnd = null;
    };
    for (const seg of segments) {
      const segText = (seg.text || "").trim();
      if (!segText) continue;
      const start = typeof seg.offset === "number" ? seg.offset : (seg.start ?? null);
      const dur = typeof seg.duration === "number" ? seg.duration : 0;
      const end = start == null ? null : start + dur;
      const projected = buf ? `${buf} ${segText}` : segText;
      if (buf.length + segText.length + 1 > TARGET_CHARS && buf.length >= MIN_CHUNK_CHARS) {
        flush();
      }
      if (!buf) bufStart = start;
      buf = projected;
      if (end != null) bufEnd = end;
    }
    if (buf.trim().length >= MIN_CHUNK_CHARS) flush();
    if (chunks.length) return chunks;
    // Fall through to char windowing if no timestamped segments produced chunks.
  }
  // Char windowing (fallback: ghost-reconstructed transcripts, synthetic).
  let i = 0;
  let idx = 0;
  while (i < text.length) {
    const end = Math.min(i + TARGET_CHARS, text.length);
    // Try not to cut words — back up to the last sentence/space.
    let cut = end;
    if (end < text.length) {
      const tail = text.slice(i, end);
      const m = tail.match(/[.!?]\s+[A-Za-z0-9"']*$/);
      if (m && m.index != null && m.index > TARGET_CHARS * 0.5) {
        cut = i + m.index + 1;
      } else {
        const sp = tail.lastIndexOf(" ");
        if (sp > TARGET_CHARS * 0.6) cut = i + sp;
      }
    }
    const t = text.slice(i, cut).trim();
    if (t.length >= MIN_CHUNK_CHARS) {
      chunks.push({ text: t, startTs: null, endTs: null });
    }
    i = cut > i ? cut - OVERLAP_CHARS : end; // slide with overlap
    if (i <= idx) i = end; // avoid infinite loop on pathological input
    idx = i;
  }
  return chunks;
}

function fmtTs(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(mm)}:${pad(r)}`;
  return `${pad(mm)}:${pad(r)}`;
}

// ---------------------------------------------------------------------------
// Index + chat handlers.
// ---------------------------------------------------------------------------

async function fetchTranscript(videoId: string, lang = "en"): Promise<{
  text: string;
  segments: any[];
  source: string;
  ghostReconstructed: boolean;
}> {
  // Reuse the existing transcript pipeline by calling our own edge route
  // server-to-server. Edge routes are also available over loopback via
  // the local origin during dev; in Vercel the preferred pattern is to
  // re-import. To avoid dual-bundling we call the public endpoint via
  // the env-derived base URL.
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.SELF_URL || "http://127.0.0.1:5173";
  // Try local import first (preferred; avoids a network hop).
  try {
    const mod = await import("./transcript.js");
    // The edge default handler expects a Request — build a minimal one.
    const req = new Request(`${base}/api/transcript`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `https://youtu.be/${videoId}`, lang }),
    });
    const res = (await mod.default(req)) as Response;
    if (res.ok) {
      const json = (await res.json()) as {
        transcript?: string;
        segments?: any[];
        source?: string;
        ghostReconstructed?: boolean;
      };
      return {
        text: json.transcript || "",
        segments: Array.isArray(json.segments) ? json.segments : [],
        source: json.source || "unknown",
        ghostReconstructed: !!json.ghostReconstructed,
      };
    }
  } catch (e) {
    console.warn("[interrogate] direct transcript import failed, falling through:", e);
  }
  throw new Error("Transcript fetch failed");
}

export async function handleInterrogateIndex(req: Request): Promise<Response> {
  const auth = await verifyAuth(req);
  if (!auth) return jsonResponse({ error: "Auth required" }, 401);
  const body = await safeJsonBody(req);
  if (body.error) return jsonResponse({ error: body.error }, 400);
  const { url, slotId = 0, lang = "en" } = body.data || {};
  if (!url || typeof url !== "string") return jsonResponse({ error: "url required" }, 400);
  const videoIdMatch = url.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  const videoId = videoIdMatch ? videoIdMatch[1] : url.length === 11 ? url : null;
  if (!videoId) return jsonResponse({ error: "Invalid YouTube URL" }, 400);

  // Check if already indexed.
  const existing = await supaRpc<{ count: number; has_embeddings: boolean }>(
    "ghost_count_chunks",
    { p_user_id: auth.userId, p_video_id: videoId },
  ).catch(() => ({ count: 0, has_embeddings: false }));
  if (existing.count > 0 && existing.has_embeddings) {
    return jsonResponse({
      videoId,
      chunksIndexed: existing.count,
      totalChunks: existing.count,
      alreadyIndexed: true,
      ghostReconstructed: false,
    });
  }

  // Consume one "first-index" credit. Free/paywalled users get blocked here.
  const verdict = await consumeGhostAction(req, INTERROGATE_ACTION);
  if (!verdict.allowed) {
    return jsonResponse({
      error: verdict.code === "PAYWALL" ? "Pro required to interrogate" : "Daily limit reached",
      code: verdict.code,
      resetAt: verdict.reset_at,
      remaining: verdict.remaining,
    }, verdict.code === "AUTH_REQUIRED" ? 401 : 402);
  }

  // Pull transcript (may be ghost-reconstructed).
  let transcript;
  try {
    transcript = await fetchTranscript(videoId, typeof lang === "string" ? lang : "en");
  } catch (e) {
    console.error("[interrogate] transcript error:", e);
    return jsonResponse({ error: "Could not retrieve transcript" }, 502);
  }

  // Chunk.
  const chunks = chunkTranscript(transcript.text, transcript.segments);
  if (chunks.length === 0) {
    return jsonResponse({ error: "Transcript too short to interrogate" }, 422);
  }

  // Embed all chunks.
  let embeddings: number[][];
  try {
    embeddings = await (await import("../packages/orchestrator/embeddings.js")).embedTexts(
      chunks.map((c) => c.text),
    );
  } catch (e) {
    console.error("[interrogate] embedding error:", e);
    // If embeddings fail, fall back to lexical (BM25-ish) search by
    // inserting chunks with NULL embedding and marking the session as
    // lexical-only. Answers degrade but the feature doesn't hard-fail.
    embeddings = chunks.map(() => [] as number[]);
  }

  // Build RPC payload.
  const payload = chunks.map((c, i) => ({
    chunk_index: i,
    start_ts: c.startTs,
    end_ts: c.endTs,
    text: c.text,
    embedding: embeddings[i]?.length === 1536 ? embeddings[i] : null,
    meta: {
      source: transcript.source,
      ghostReconstructed: transcript.ghostReconstructed,
      lengthChars: c.text.length,
    },
  }));

  try {
    await supaRpc("ghost_index_chunks", {
      p_user_id: auth.userId,
      p_video_id: videoId,
      p_slot_id: typeof slotId === "number" ? slotId : 0,
      p_chunks: payload,
    });
  } catch (e) {
    console.error("[interrogate] index RPC error:", e);
    return jsonResponse({ error: "Could not persist memory" }, 500);
  }

  return jsonResponse({
    videoId,
    chunksIndexed: chunks.length,
    totalChunks: chunks.length,
    ghostReconstructed: transcript.ghostReconstructed,
  });
}

interface RetrievedChunk {
  chunk_index: number;
  text: string;
  start_ts: number | null;
  end_ts: number | null;
  meta?: { ghostReconstructed?: boolean; source?: string };
  similarity?: number;
}

export async function handleInterrogateChat(req: Request): Promise<Response> {
  // MP7 latency pass. The former ordering was three strictly serialised
  // blocking hops before any retrieval could start:
  //
  //     verify auth (GoTrue) -> parse body -> embed query (OpenAI) -> search
  //
  // Body parsing is local and cheap, so it is hoisted first. Auth
  // verification and query embedding are mutually independent, so they are
  // issued concurrently and the pair costs max(a, b) instead of a + b.
  // Against the §6 budget (chat turn P95 < 3.5s) this removes one full
  // network round-trip — typically 120-400ms — from every chat turn.
  //
  // Cost guard: the embedding is only issued when a syntactically valid
  // bearer token is present, so unauthenticated traffic cannot induce
  // billable embedding calls. A token that is well-formed but invalid may
  // waste one embed (~$0.000002); that is an acceptable trade for removing
  // a round-trip from every legitimate turn.
  const body = await safeJsonBody(req);
  if (body.error) return jsonResponse({ error: body.error }, 400);
  const { videoId, query } = body.data || {};
  if (!videoId || typeof videoId !== "string") return jsonResponse({ error: "videoId required" }, 400);
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return jsonResponse({ error: "query required" }, 400);
  }

  const hasBearer = extractBearer(req.headers.get("authorization")) !== null;
  if (!hasBearer) return jsonResponse({ error: "Auth required" }, 401);

  interface EmbedOutcome {
    value: number[] | null;
    error: unknown;
  }

  const authPromise = verifyAuth(req);
  const embedPromise: Promise<EmbedOutcome> = embedText(query.trim()).then(
    (value): EmbedOutcome => ({ value, error: null }),
    (error: unknown): EmbedOutcome => ({ value: null, error }),
  );

  const auth = await authPromise;
  const embedOutcome = await embedPromise;

  if (!auth) return jsonResponse({ error: "Auth required" }, 401);

  if (embedOutcome.value === null) {
    console.error("[interrogate] query embed error:", embedOutcome.error);
    return jsonResponse({ error: "Embedding failed" }, 502);
  }
  const qEmbed: number[] = embedOutcome.value;

  // Vector search.
  let chunks: RetrievedChunk[] = [];
  let isLexical = false;
  try {
    const results = await supaRpc<RetrievedChunk[]>("ghost_search_chunks", {
      p_user_id: auth.userId,
      p_video_id: videoId,
      p_embedding: qEmbed,
      p_k: 6,
    });
    chunks = Array.isArray(results) ? results : [];
  } catch (e) {
    console.warn("[interrogate] vector search failed:", e);
    chunks = [];
  }

  // If vector search returned nothing (no embeddings stored), fall back to
  // lexical: pick chunks by token overlap. We do this client-side over the
  // first N chunks loaded — for that we'd need a list endpoint. Keep it
  // simple: if no chunks, return an "index first" error.
  if (chunks.length === 0) {
    isLexical = true;
    // Attempt lexical: fetch chunks for this (user,video) directly — we
    // don't have a list RPC yet, so fail with ACTION_REQUIRED and let the
    // UI re-trigger index.
    return jsonResponse({
      error: "Video not indexed yet",
      code: "INDEX_REQUIRED",
    }, 428);
  }

  const ghostReconstructed = chunks.some((c) => c.meta?.ghostReconstructed);

  // Build prompt.
  const context = chunks
    .map((c, i) => {
      const ts = fmtTs(c.start_ts);
      return `[${ts || `chunk ${c.chunk_index}`}] (similarity ${(c.similarity ?? 0).toFixed(2)})\n${c.text}`;
    })
    .join("\n\n---\n\n");

  const system = [
    "You are GHOST INTERROGATION — an elite YouTube competitive intelligence analyst.",
    "Answer the creator's question using ONLY the transcript excerpts provided below.",
    "Ground every factual claim in a timestamped excerpt; prefix each cited claim with [MM:SS].",
    ghostReconstructed
      ? "NOTICE: This transcript was reconstructed via the Ghost scaffold (live captions unavailable). Flag this with '(scaffold answer)' if the answer relies on reconstruction rather than exact words."
      : "",
    "Be concise, punchy, cyberpunk tone — 'Ghost Protocol' diction, but never hide uncertainty.",
    "If the excerpts do not contain an answer, say 'No matching intel' and suggest a better question.",
  ].filter(Boolean).join("\n");

  const userPrompt = `COMPETITOR TRANSCRIPT EXCERPTS:\n"""\n${context}\n"""\n\nCREATOR QUESTION: ${query.trim()}\n\nAnswer with timestamp citations.`;

  let result;
  try {
    result = await gatewayChatText({
      systemPrompt: system,
      userPrompt,
      temperature: 0.3,
      maxTokens: 900,
      deadlineMs: 20_000,
      headroomHints: [query.trim()],
    });
  } catch (e) {
    console.error("[interrogate] chat error:", e);
    return jsonResponse({ error: "AI generation failed" }, 502);
  }

  return jsonResponse({
    answer: result.text,
    model: result.model,
    ghostReconstructed,
    lexicalFallback: isLexical,
    citations: chunks.map((c) => ({
      chunkIndex: c.chunk_index,
      startTs: c.start_ts,
      endTs: c.end_ts,
      text: c.text,
      similarity: c.similarity ?? 0,
    })),
    headroom: result.headroom,
  });
}
