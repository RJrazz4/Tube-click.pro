/**
 * api/_ai.ts — AI chat-text generation.
 *
 * Authoritative server path for chat (TubeBot) and structured JSON
 * generation. All LLM traffic is routed through the Vercel AI Gateway
 * (`packages/orchestrator/ai-gateway.ts`), which handles retries, model
 * fallback, rate-limit backoff, caching, and observability. This module
 * is responsible for:
 *   - Wrapping the SDK call in our stable `ChatGenerationError` shape so
 *     existing client-side error mappers (src/lib/friendlyError.ts)
 *     keep working unchanged.
 *   - Enforcing a per-call timeout and honoring caller-supplied abort
 *     signals.
 *   - Emitting structured, key-material-free logs for production
 *     debugging.
 *
 * Runtime: Edge-safe (fetch, AbortController, setTimeout, Date.now).
 */
import {
  gatewayChatJson,
  gatewayChatText,
  GatewayConfigError,
  type GatewayChatOptions,
} from "../packages/orchestrator/ai-gateway.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface GenerateChatJsonOptions {
  systemPrompt: string;
  userPrompt: string;
  /** Sampling temperature. Default 0.9 (creative content). */
  temperature?: number;
  /** Max output tokens. Default 8192. */
  maxTokens?: number;
  /** Global wall-clock deadline (ms) for the call. Falls back to env/20s. */
  deadlineMs?: number;
  /** Legacy alias retained for callers — maps to deadlineMs. */
  attemptTimeoutMs?: number;
  /** Abort signal from the edge caller (reserved for future use). */
  signal?: AbortSignal;
  /** @deprecated Fetch injection is now supported for tests via this param. */
  fetchImpl?: unknown;
  /** @deprecated Use deadlineMs — kept for API compatibility. */
  now?: unknown;
}

export interface ChatGenerationOutcome {
  /** Raw model text (JSON-mode callers parse this). */
  content: string;
  /** Model id that produced the content (post-fallback). */
  model: string;
  /** Always 0 now that the gateway manages the connection pool. */
  keyIndex: number;
  /** Always 1; the gateway handles retries internally. */
  attempts: number;
  /** Wall-clock latency (ms). */
  latencyMs: number;
  /** Models attempted in order (primary then fallbacks). */
  modelsAttempted: string[];
  /** True when a fallback model served the request. */
  failedOver: boolean;
}

/**
 * Stable error type. `code` uses the existing taxonomy consumed by
 * src/lib/friendlyError.ts so the UI does not change.
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

/** Classify an unknown thrown value into a stable ChatGenerationError. */
function toChatGenerationError(
  err: unknown,
  modelsAttempted: string[],
): ChatGenerationError {
  // AI SDK errors expose a `statusCode` when the HTTP response is readable,
  // plus a name ("AI_InvalidDataError", "AI_APICallError", etc.). We map
  // the ones we care about onto our legacy codes and render everything
  // else as UPSTREAM_ERROR / UNKNOWN.
  const e = err as {
    name?: string;
    statusCode?: number;
    status?: number;
    data?: unknown;
    responseBody?: string;
    message?: string;
    isRetryable?: boolean;
  };
  const status = e.statusCode ?? e.status ?? 502;
  const noteModels = { modelsAttempted };

  if (err instanceof ChatGenerationError) return err;

  if (err instanceof GatewayConfigError) {
    return new ChatGenerationError(
      "API_KEY_INVALID",
      err.message,
      500,
      { action: "Admin: verify AI_GATEWAY_API_KEY in the Vercel project environment variables.", ...noteModels },
    );
  }

  if (e.name === "AI_APICallError" || e.name === "APICallError") {
    if (status === 401 || status === 403) {
      return new ChatGenerationError(
        "API_KEY_INVALID",
        "The AI service key is invalid or unauthorized — this is a server configuration issue.",
        500,
        { action: "Admin: verify AI_GATEWAY_API_KEY in the Vercel project environment variables.", ...noteModels },
      );
    }
    if (status === 402 || status === 429) {
      if (status === 402) {
        return new ChatGenerationError(
          "INSUFFICIENT_CREDITS",
          "The AI credit pool is temporarily exhausted. Please try again later.",
          402,
          { action: "Admin: check Vercel AI Gateway billing and quotas.", ...noteModels },
        );
      }
      return new ChatGenerationError(
        "RATE_LIMITED",
        "AI is busy right now — too many requests. Please wait a moment and try again.",
        429,
        noteModels,
      );
    }
    if (status === 408 || (err as Error)?.name === "AbortError" || /abort|timeout/i.test(e.message ?? "")) {
      return new ChatGenerationError("TIMEOUT", "The AI request timed out. Please try again.", 504, noteModels);
    }
    if (status === 404) {
      return new ChatGenerationError(
        "MODEL_NOT_FOUND",
        "The requested AI model is currently unavailable. Please try again shortly.",
        502,
        { action: "Admin: verify AI_GATEWAY_PRIMARY and AI_GATEWAY_FALLBACKS against the model catalog.", ...noteModels },
      );
    }
    if (status >= 500) {
      return new ChatGenerationError(
        "UPSTREAM_ERROR",
        "The AI provider is temporarily unavailable. Please try again shortly.",
        502,
        noteModels,
      );
    }
    if (status === 400) {
      return new ChatGenerationError(
        "BAD_REQUEST",
        "The AI service rejected the request. Please adjust the input and try again.",
        400,
        noteModels,
      );
    }
  }

  if (
    (err as Error)?.name === "AbortError" ||
    (e.name === "AI_APICallError" && /abort|timeout/i.test(e.message ?? "")) ||
    /abort|timeout/i.test((err as Error)?.message ?? "")
  ) {
    return new ChatGenerationError("TIMEOUT", "The AI request timed out. Please try again.", 504, noteModels);
  }
  if (e.name === "AI_InvalidDataError" || /invalid json|parse/i.test(e.message ?? "")) {
    return new ChatGenerationError(
      "UPSTREAM_ERROR",
      "The AI provider returned an unexpected response. Please try again.",
      502,
      noteModels,
    );
  }

  return new ChatGenerationError(
    "UNKNOWN",
    err instanceof Error ? err.message : "AI text generation failed.",
    502,
    noteModels,
  );
}

/**
 * Generate structured JSON-mode chat text via the Vercel AI Gateway.
 *
 * The returned `ChatGenerationOutcome` matches the legacy shape used by
 * existing callers; fields that no longer apply (keyIndex, attempts)
 * are set to safe defaults.
 *
 * @throws {ChatGenerationError} with stable code/status.
 */
export async function generateChatJson(
  opts: GenerateChatJsonOptions,
): Promise<ChatGenerationOutcome> {
  const gwOpts: GatewayChatOptions = {
    systemPrompt: opts.systemPrompt,
    userPrompt: opts.userPrompt,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    deadlineMs: opts.deadlineMs ?? opts.attemptTimeoutMs,
    signal: opts.signal,
    fetchImpl: typeof opts.fetchImpl === "function" ? (opts.fetchImpl as typeof fetch) : undefined,
  };

  try {
    const result = await gatewayChatJson(gwOpts);
    return {
      content: result.text,
      model: result.model,
      keyIndex: 0,
      attempts: 1,
      latencyMs: result.latencyMs,
      modelsAttempted: result.modelsAttempted,
      failedOver: result.failedOver,
    };
  } catch (err) {
    const mapped = toChatGenerationError(
      err,
      (err as { modelsAttempted?: string[] })?.modelsAttempted ?? [],
    );
    // Best-effort log; error message already trimmed upstream.
    console.error(
      `[chat-ai] failed code=${mapped.code} status=${mapped.status}`,
    );
    throw mapped;
  }
}

/**
 * Free-text variant — same call path but without the strict-JSON wrapper.
 * Used when the caller wants prose/markdown rather than a parseable payload.
 */
export async function generateChatText(
  opts: GatewayChatOptions,
): Promise<ChatGenerationOutcome> {
  try {
    const result = await gatewayChatText(opts);
    return {
      content: result.text,
      model: result.model,
      keyIndex: 0,
      attempts: 1,
      latencyMs: result.latencyMs,
      modelsAttempted: result.modelsAttempted,
      failedOver: result.failedOver,
    };
  } catch (err) {
    throw toChatGenerationError(err, []);
  }
}
