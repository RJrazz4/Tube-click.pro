/**
 * api/_ai.ts — Unified OpenRouter chat-text generation (Phase F3 / Master Plan).
 *
 * Single, authoritative server path for /chat-agent text generation. Backed by
 * the tested orchestrator OpenRouterClient (packages/orchestrator) instead of
 * the hand-rolled loop in _shared.ts. This is the "one text stack" the Master
 * Plan converges on.
 *
 * Guarantees (maps 1:1 to the diagnosed root causes):
 *  - RC-1/RC-4: normalized key resolution via openRouterKeys() (plural |
 *    singular | numbered) — all configured keys are ALWAYS on the path.
 *  - RC-2: per-attempt hard AbortController timeout + a global wall-clock
 *    deadline, so a slow/hung upstream can never drop the connection (the
 *    client "Ghost tunnel interference" failure mode).
 *  - RC-3: the deadline sits well inside the 25s edge maxDuration, so the
 *    function always returns a typed response before the platform severs it.
 *  - Resilience: KeyPool round-robin + cooldown + exhaustion across keys, plus
 *    a model-fallback chain for 404 / 5xx / timeout (different upstream routing).
 *  - Observability: structured, key-material-free per-attempt logs.
 *  - Typed ChatGenerationError carries normalized codes the client maps via
 *    friendlyError() unchanged (RATE_LIMITED / API_KEY_INVALID / TIMEOUT / …).
 *
 * Edge-safe: uses only fetch, AbortController, setTimeout, Date.now, JSON.
 */
import {
  OpenRouterClient,
  OpenRouterError,
  OPENROUTER_DEFAULT_BASE_URL,
  type ChatMessage,
} from "../packages/orchestrator/manager/openrouter-client.js";
import { maskKey } from "../packages/shared/env/index.js";
import { openRouterKeys, openRouterModelChain } from "./_shared.js";

export type { ChatMessage };

export interface GenerateChatJsonOptions {
  systemPrompt: string;
  userPrompt: string;
  /** Sampling temperature. Default 0.9 (creative content). */
  temperature?: number;
  /** Max output tokens. Default 8192. */
  maxTokens?: number;
  /** Global wall-clock deadline (ms) across ALL models + keys. Default OPENROUTER_CHAT_DEADLINE_MS / 17000. */
  deadlineMs?: number;
  /** Per-attempt upstream timeout (ms). Default OPENROUTER_CHAT_ATTEMPT_TIMEOUT_MS / 7000. */
  attemptTimeoutMs?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Injectable clock for tests. */
  now?: () => number;
}

export interface ChatGenerationOutcome {
  /** Raw model text (JSON-mode; caller parses). */
  content: string;
  /** OpenRouter model id that produced the content. */
  model: string;
  /** Index (0-based) of the pool key that succeeded. */
  keyIndex: number;
  /** Attempts consumed on the winning model (1 = first key worked). */
  attempts: number;
  /** Total wall-clock latency (ms). */
  latencyMs: number;
  /** Distinct models tried, in order. */
  modelsAttempted: string[];
  /** True if rotation / model failover actually happened. */
  failedOver: boolean;
}

/**
 * Typed, normalized failure. `code` mirrors the server/client taxonomy so
 * src/lib/friendlyError.ts maps it with zero changes.
 */
export class ChatGenerationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;
  readonly action?: string;
  readonly modelsAttempted: string[];

  constructor(
    code: string,
    message: string,
    status: number,
    opts?: { retryAfter?: number; action?: string; modelsAttempted?: string[] },
  ) {
    super(message);
    this.name = "ChatGenerationError";
    this.code = code;
    this.status = status;
    if (opts?.retryAfter !== undefined) this.retryAfter = opts.retryAfter;
    if (opts?.action !== undefined) this.action = opts.action;
    this.modelsAttempted = opts?.modelsAttempted ?? [];
  }
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** One-time boot log of pool size + model chain (counts only, zero key material). */
let loggedPoolConfig = false;

/**
 * Wraps fetch to emit a key-material-free per-attempt observation line:
 *   [chat-ai] openrouter http=429 latency=318ms model=google/gemini-2.5-flash key=sk-o...a1f3
 * Used for rotation/latency debugging (Phase 5 observability).
 */
function makeObservabilityFetch(baseFetch: typeof fetch, now: () => number): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const t0 = now();
    let model = "?";
    let keyTag = "—";
    try {
      if (init && typeof init.body === "string") {
        const parsed = JSON.parse(init.body) as { model?: unknown };
        if (typeof parsed.model === "string") model = parsed.model;
      }
      const headers = init?.headers as Record<string, string> | undefined;
      const auth =
        headers && typeof headers === "object"
          ? headers.Authorization ?? headers.authorization
          : undefined;
      if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
        keyTag = maskKey(auth.slice(7));
      }
    } catch {
      /* observation must never break the request */
    }
    let status = 0;
    try {
      const res = await baseFetch(input as RequestInfo, init as RequestInit);
      status = res.status;
      return res;
    } finally {
      console.log(`[chat-ai] openrouter http=${status} latency=${now() - t0}ms model=${model} key=${keyTag}`);
    }
  };
}

/** True when a model-level failover could plausibly help (different upstream). */
function shouldFailOverModel(err: OpenRouterError): boolean {
  return (
    err.kind === "timeout" ||
    err.kind === "provider_unavailable" ||
    err.statusCode === 404 ||
    (typeof err.statusCode === "number" && err.statusCode >= 500)
  );
}

/** Map an orchestrator OpenRouterError (or unknown) to a client-safe code+status. */
function toChatGenerationError(err: unknown, modelsAttempted: string[]): ChatGenerationError {
  const noteModels = { modelsAttempted };
  if (err instanceof OpenRouterError) {
    const retryAfter = err.retryAfterMs !== undefined ? Math.ceil(err.retryAfterMs / 1000) : undefined;
    switch (err.kind) {
      case "rate_limit":
        return new ChatGenerationError(
          "RATE_LIMITED",
          retryAfter
            ? `AI is busy — the rate limit was reached. Please wait about ${retryAfter}s and try again.`
            : "AI is busy right now — too many requests. Please wait a moment and try again.",
          429,
          { retryAfter, action: retryAfter ? `Auto-retry after ~${retryAfter} seconds is recommended.` : undefined, ...noteModels },
        );
      case "quota_exceeded":
        return new ChatGenerationError(
          "INSUFFICIENT_CREDITS",
          "The AI credit pool is temporarily exhausted. Please try again later.",
          402,
          { action: "Admin: top up OpenRouter credits or add more keys to OPENROUTER_API_KEYS.", ...noteModels },
        );
      case "auth":
        return new ChatGenerationError(
          "API_KEY_INVALID",
          "The AI service key is invalid or unauthorized — this is a server configuration issue, not something you did wrong.",
          500,
          { action: "Admin: verify OPENROUTER_API_KEYS in the Vercel project environment variables.", ...noteModels },
        );
      case "timeout":
        return new ChatGenerationError(
          "TIMEOUT",
          "The AI request timed out. Please try again.",
          504,
          noteModels,
        );
      case "provider_unavailable":
        return new ChatGenerationError(
          "UPSTREAM_ERROR",
          "The AI provider is temporarily unavailable. Please try again shortly.",
          502,
          noteModels,
        );
      case "invalid_request":
        return err.statusCode === 404
          ? new ChatGenerationError(
              "MODEL_NOT_FOUND",
              "The requested AI model is currently unavailable. Please try again in a moment.",
              502,
              { action: "Admin: check the configured OPENROUTER_MODEL against the list of available models.", ...noteModels },
            )
          : new ChatGenerationError(
              "BAD_REQUEST",
              "The AI service rejected the request. Please adjust the input and try again.",
              400,
              noteModels,
            );
      default:
        return new ChatGenerationError(
          "UNKNOWN",
          "The AI service returned an unexpected error. Please try again.",
          502,
          noteModels,
        );
    }
  }
  return new ChatGenerationError(
    "UNKNOWN",
    err instanceof Error ? err.message : "OpenRouter text generation failed.",
    502,
    noteModels,
  );
}

/**
 * Generate JSON-mode chat text via OpenRouter with full key rotation,
 * per-attempt timeouts, a global deadline, and model failover.
 *
 * @throws {ChatGenerationError} on any failure — always carries a client-safe code.
 */
export async function generateChatJson(opts: GenerateChatJsonOptions): Promise<ChatGenerationOutcome> {
  const now = opts.now ?? Date.now;

  // RC-4: normalized key resolution (plural | singular | numbered).
  let keys: string[];
  try {
    keys = openRouterKeys();
  } catch {
    throw new ChatGenerationError(
      "API_KEY_INVALID",
      "The AI service key is not configured on the server — this is a server configuration issue, not something you did wrong.",
      500,
      { action: "Admin: set OPENROUTER_API_KEYS (comma-separated) in the Vercel project environment variables.", modelsAttempted: [] },
    );
  }

  const models = openRouterModelChain();
  const deadlineMs = opts.deadlineMs ?? numEnv("OPENROUTER_CHAT_DEADLINE_MS", 17000);
  const attemptTimeoutMs = opts.attemptTimeoutMs ?? numEnv("OPENROUTER_CHAT_ATTEMPT_TIMEOUT_MS", 7000);
  // One full rotation through the pool per model; cap at 3 to stay inside the deadline.
  const maxAttempts = Math.min(keys.length, 3);
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? OPENROUTER_DEFAULT_BASE_URL;
  const siteUrl = process.env.OPENROUTER_SITE_URL;
  const siteTitle = process.env.OPENROUTER_SITE_TITLE;

  if (!loggedPoolConfig) {
    loggedPoolConfig = true;
    console.log(`[chat-ai] OpenRouter pool ready: ${keys.length} key(s) • models: ${models.join(" → ")} • deadline=${deadlineMs}ms • attemptTimeout=${attemptTimeoutMs}ms`);
  }

  const started = now();
  const modelsAttempted: string[] = [];
  const fetchImpl = makeObservabilityFetch(opts.fetchImpl ?? fetch, now);
  let lastError: ChatGenerationError | null = null;

  for (const model of models) {
    if (!modelsAttempted.includes(model)) modelsAttempted.push(model);

    const remaining = deadlineMs - (now() - started);
    if (remaining < 3000) {
      // Not enough budget left to justify another model's rotation; stop.
      break;
    }

    const client = new OpenRouterClient({
      keys,
      model,
      baseUrl,
      timeoutMs: attemptTimeoutMs,
      retryBudgetMs: Math.max(3000, remaining),
      maxAttempts,
      siteUrl,
      siteTitle,
      fetchImpl,
      now,
    });

    try {
      const result = await client.completeJson({
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
        temperature: opts.temperature ?? 0.9,
        maxTokens: opts.maxTokens ?? 8192,
      });

      const latencyMs = now() - started;
      const failedOver = modelsAttempted.length > 1 || result.attempts > 1 || result.keyIndex > 0;
      console.log(`[chat-ai] OK model=${result.model} key#${result.keyIndex + 1}/${keys.length} attempts=${result.attempts} latency=${latencyMs}ms${failedOver ? " (rotated)" : ""}`);
      return {
        content: result.content,
        model: result.model,
        keyIndex: result.keyIndex,
        attempts: result.attempts,
        latencyMs,
        modelsAttempted,
        failedOver,
      };
    } catch (err) {
      lastError = toChatGenerationError(err, modelsAttempted);
      const moreModels = modelsAttempted.length < models.length;
      console.error(
        `[chat-ai] model=${model} failed → ${lastError.code} (status ${lastError.status})${lastError.retryAfter ? ` retryAfter≈${lastError.retryAfter}s` : ""}${moreModels ? " — failing over to next model" : " — no more models"}`,
      );
      if (err instanceof OpenRouterError && shouldFailOverModel(err) && moreModels) {
        continue;
      }
      throw lastError;
    }
  }

  throw (
    lastError ??
    new ChatGenerationError("UNKNOWN", "OpenRouter text generation failed — deadline exhausted.", 504, { modelsAttempted })
  );
}
