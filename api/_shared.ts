/**
 * Shared helpers for Vercel Edge and Node functions.
 *
 * All functions in this module run server-side only; nothing here is
 * shipped to the browser. Helpers cover CORS, request parsing, timeout
 * signals, error classification, and the OpenRouter key-rotation fetch
 * used by older routes.
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Safely parse JSON body — returns { data, error? } — check error before using data */
export async function safeJsonBody(req: Request): Promise<{ data: any; error?: string }> {
  try {
    const data = await req.json();
    return { data };
  } catch (e: any) {
    return { data: null, error: `Invalid JSON body: ${e.message || 'parse error'}` };
  }
}

/** Create an AbortController with timeout (ms) — use for external API calls */
export function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

/** Classify fetch errors into user-friendly messages */
export function classifyFetchError(e: unknown, service: string): string {
  if (e instanceof DOMException && e.name === 'AbortError') return `${service} request timed out`;
  if (e instanceof TypeError && e.message?.includes('fetch')) return `${service} network error`;
  return `${service} error: ${(e as any)?.message || 'unknown'}`;
}

export function requireEnv(key: string): string {
  const val = process.env[key] || "";
  if (!val) throw new Error(`${key} not configured on server. Set in Vercel dashboard or via supabase secrets set ${key}=...`);
  return val;
}

/* ------------------------------------------------------------------ *
 * OpenRouter configuration (OpenAI-compatible chat completions).
 * Default model and fallbacks can be overridden per environment.
 * ------------------------------------------------------------------ */
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Primary model; override with OPENROUTER_MODEL. */
export const OPENROUTER_MODEL = "google/gemini-2.5-flash";
/** Default fallback chain; override with OPENROUTER_MODEL_FALLBACKS (comma-separated). */
export const OPENROUTER_MODEL_FALLBACKS = ["google/gemini-2.5-flash-lite"];
/*
 * Note: Gemini 2.0 model paths are retired on OpenRouter; 2.5-flash and
 * 2.5-flash-lite are the direct successors (same tier, support
 * response_format + temperature, 1M context window).
 */

export function extractGeminiText(data: any) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("\n")
    .trim();
}

/* ------------------------------------------------------------------ *
 * OpenRouter fetch: key rotation + model failover.
 * ------------------------------------------------------------------ */

export interface OpenRouterFetchOutcome {
  /** Final Response (ok, or the last error if everything failed). */
  res: Response;
  /** OpenRouter model id that produced the response. */
  model: string;
  /** Models attempted, in order — no key material is ever recorded. */
  attempted: string[];
  /** True when key rotation and/or model failover fired. */
  failedOver: boolean;
}

/**
 * Resolve OpenRouter API keys from environment.
 *
 * Accepted forms, in priority order:
 *   1. OPENROUTER_API_KEYS=k1,k2,k3   (preferred, comma-separated)
 *   2. OPENROUTER_API_KEY=k1          (singleton legacy alias)
 *   3. OPENROUTER_API_KEY_1..N        (numbered form)
 *
 * Returns a trimmed, de-duplicated array. Throws a descriptive error when
 * no usable key is configured, so a mis-named variable cannot silently
 * disable rotation.
 */
export function openRouterKeys(): string[] {
  const env = process.env;
  const collected: string[] = [];
  const plural = (env.OPENROUTER_API_KEYS || "").trim();
  if (plural) {
    collected.push(...plural.split(","));
  } else {
    const singular = (env.OPENROUTER_API_KEY || "").trim();
    if (singular) collected.push(singular);
    for (let i = 1; i <= 20; i++) {
      const numbered = (env[`OPENROUTER_API_KEY_${i}`] || "").trim();
      if (numbered) collected.push(numbered);
    }
  }
  const unique = [...new Set(collected.map(k => k.trim()).filter(Boolean))];
  if (!unique.length) {
    throw new Error("OPENROUTER_API_KEYS not configured on server. Set a comma-separated list (OPENROUTER_API_KEYS=key1,key2,key3), a single OPENROUTER_API_KEY, or numbered OPENROUTER_API_KEY_1/2/3 in the Vercel project env vars.");
  }
  return unique;
}

/** Model chain: OPENROUTER_MODEL env > default; OPENROUTER_MODEL_FALLBACKS env (CSV) > default. */
export function openRouterModelChain(): string[] {
  const primary = (process.env.OPENROUTER_MODEL || OPENROUTER_MODEL).trim();
  const fallbacks = (process.env.OPENROUTER_MODEL_FALLBACKS || OPENROUTER_MODEL_FALLBACKS.join(","))
    .split(",").map(s => s.trim()).filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

/**
 * Convert our internal Gemini-style request body into OpenRouter's
 * OpenAI-compatible chat.completions payload. Vision (inlineData) parts
 * become image_url data URIs; responseMimeType: application/json maps to
 * response_format: { type: "json_object" }.
 */
export function toOpenRouterBody(geminiStyleBody: any, model: string): any {
  const messages: any[] = [];
  const sysText = (geminiStyleBody?.systemInstruction?.parts ?? [])
    .map((p: any) => p?.text).filter((t: any): t is string => typeof t === "string" && !!t).join("\n");
  if (sysText) messages.push({ role: "system", content: sysText });

  for (const c of geminiStyleBody?.contents ?? []) {
    const parts: any[] = c?.parts ?? [];
    const converted: any[] = [];
    for (const p of parts) {
      if (typeof p?.text === "string") converted.push({ type: "text", text: p.text });
      else if (p?.inlineData?.data) converted.push({ type: "image_url", image_url: { url: `data:${p.inlineData.mimeType || "image/png"};base64,${p.inlineData.data}` } });
    }
    const role = c?.role === "model" ? "assistant" : (c?.role === "system" ? "system" : "user");
    const singleText = converted.length === 1 && converted[0]?.type === "text";
    messages.push({ role, content: singleText ? converted[0].text : converted });
  }

  if (!messages.length) throw new Error("OpenRouter payload invalid: no messages were built from the request body.");
  const out: any = { model, messages };
  const cfg = geminiStyleBody?.generationConfig ?? {};
  if (typeof cfg.temperature === "number") out.temperature = cfg.temperature;
  if (cfg.responseMimeType === "application/json") out.response_format = { type: "json_object" };
  if (typeof cfg.maxOutputTokens === "number") out.max_tokens = cfg.maxOutputTokens;
  return out;
}

/** Extract assistant text from an OpenAI-compatible chat.completions response */
export function extractOpenRouterText(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((p: any) => p?.text || "").join("\n").trim();
  return "";
}

const sleepMsOR = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Error categories where backoff is useless and rotating key/model is the remedy. */
const OR_ROTATE_CODES = new Set(["RATE_LIMITED", "QUOTA_EXCEEDED_DAILY", "INSUFFICIENT_CREDITS", "API_KEY_INVALID"]);

export interface OpenRouterFetchOptions {
  /** Gemini-style body (existing shape). */
  body: any;
  /** Per-call deadline in ms; defaults to AI_GATEWAY_TIMEOUT_MS or 45s for long-form calls. */
  deadlineMs?: number;
  /** Override max output tokens; otherwise inferred from generationConfig or a safe default. */
  maxTokens?: number;
}

/**
 * Fetch OpenAI-compatible chat completion through the Vercel AI Gateway.
 *
 * This function is now a thin compatibility shim over
 * `packages/orchestrator/ai-gateway.ts` so legacy callers (seo-tags,
 * analyze-storyboard, clone-crush) keep working without modification.
 * It accepts the legacy Gemini-style body, converts it to system+user
 * prompts, calls the gateway, and returns a synthetic `Response` whose
 * shape matches the old OpenRouter JSON envelope (`choices[0].message.content`)
 * so that existing callers' `res.json()` + `extractOpenRouterText()`
 * continue to work.
 *
 * Retries, fallback across models, rate-limit handling, and observability
 * are delegated to the gateway itself.
 */
export async function fetchOpenRouterWithRetry(
  geminiStyleBodyOrOpts: any | OpenRouterFetchOptions,
): Promise<OpenRouterFetchOutcome> {
  // Support both legacy (body-only) and new (opts object) call signatures.
  const opts: OpenRouterFetchOptions =
    geminiStyleBodyOrOpts && "body" in geminiStyleBodyOrOpts
      ? geminiStyleBodyOrOpts
      : { body: geminiStyleBodyOrOpts };
  const geminiStyleBody = opts.body;

  const { gatewayChatText, gatewayChatJson } = await import("../packages/orchestrator/ai-gateway.js");

  // Convert the Gemini-style body to system+user prompts using the
  // existing body builder so behaviour stays identical for callers.
  const primaryModel =
    process.env.AI_GATEWAY_PRIMARY?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    OPENROUTER_MODEL;
  const body = toOpenRouterBody(geminiStyleBody, primaryModel);

  // Flatten all messages into system + user. When there are multiple
  // user/assistant turns (rare for these callers) we preserve them under
  // labelled tags so the model still sees the full context.
  const messages: any[] = Array.isArray(body.messages) ? body.messages : [];
  const sysMsg = messages.find((m: any) => m.role === "system");
  const nonSys = messages.filter((m: any) => m.role !== "system");
  const systemPrompt = typeof sysMsg?.content === "string" ? sysMsg.content : "";
  let userPrompt: string;
  if (nonSys.length === 1 && typeof nonSys[0]?.content === "string") {
    userPrompt = nonSys[0].content;
  } else {
    userPrompt = nonSys
      .map((m: any) => {
        const text =
          typeof m?.content === "string"
            ? m.content
            : JSON.stringify(m?.content ?? "");
        return `<${m.role}>\n${text}\n</${m.role}>`;
      })
      .join("\n\n");
  }

  const temperature = typeof body.temperature === "number" ? body.temperature : 0.8;
  // Long-form asset generation (rewrite, full-script) needs a generous
  // budget; short JSON calls default lower. Callers can override via opts.
  const maxTokens =
    opts.maxTokens ??
    (typeof body.max_tokens === "number" ? body.max_tokens : 4096);
  const deadlineMs = opts.deadlineMs;

  const jsonMode =
    geminiStyleBody?.generationConfig?.responseMimeType === "application/json" ||
    body.response_format?.type === "json_object";

  try {
    const gwCall = jsonMode ? gatewayChatJson : gatewayChatText;
    const result = await gwCall({
      systemPrompt,
      userPrompt,
      temperature,
      maxTokens,
      deadlineMs,
    });

    // Build a synthetic OpenAI-compatible Response so downstream callers
    // can keep `await res.json()` + `extractOpenRouterText(...)` unchanged.
    const payload = {
      id: `gw-${Date.now()}`,
      object: "chat.completion",
      model: result.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: result.text },
          finish_reason: "stop",
        },
      ],
      usage: result.usage
        ? {
            prompt_tokens: result.usage.inputTokens ?? 0,
            completion_tokens: result.usage.outputTokens ?? 0,
            total_tokens: result.usage.totalTokens ?? 0,
          }
        : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    const res = new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
    return {
      res,
      model: result.model,
      attempted: result.modelsAttempted,
      failedOver: result.failedOver,
    };
  } catch (err) {
    // Surface a 502 Response with the stable error envelope consumed by
    // providerErrorResponse(); callers then turn that into a UI-safe message.
    const msg = err instanceof Error ? err.message : "AI gateway error";
    const payload = { error: { message: msg, code: "UPSTREAM_ERROR" } };
    const res = new Response(JSON.stringify(payload), {
      status: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
    return {
      res,
      model: primaryModel,
      attempted: [primaryModel],
      failedOver: false,
    };
  }
}

export function cleanupJson(value: string) {
  return value.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
}

/* ------------------------------------------------------------------ *
 * Upstream provider error normalization.
 *
 * Raw provider payloads (Gemini JSON blobs, HTML, stack traces) are
 * never surfaced to clients. The response envelope is backward
 * compatible: `error` remains a human-friendly string, and a
 * machine-readable `code` (with optional `retryAfter` / `action`) is
 * added for newer clients.
 * ------------------------------------------------------------------ */

export interface NormalizedProviderError {
  /** Machine-readable code: QUOTA_EXCEEDED_DAILY | RATE_LIMITED | API_KEY_INVALID | MODEL_NOT_FOUND | CONTENT_BLOCKED | BAD_REQUEST | UPSTREAM_ERROR | UNKNOWN */
  code: string;
  /** Human-friendly message — safe to render directly in the UI */
  message: string;
  /** HTTP status to return to our client */
  status: number;
  /** Seconds the client should wait before retrying (when the provider hints one) */
  retryAfter?: number;
  /** Optional guidance / next step */
  action?: string;
}

function safeParseJson(text: string): any | null {
  try { return JSON.parse(text); } catch { return null; }
}

function toRetrySeconds(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.ceil(v);
  if (typeof v === 'string') {
    const m = v.trim().match(/^([\d.]+)\s*s(?:econds?)?$/i);
    if (m) return Math.max(1, Math.ceil(parseFloat(m[1])));
    const n = parseInt(v, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  if (v && typeof v === 'object') {
    const o: any = v;
    if (typeof o.seconds === 'number') return Math.ceil(o.seconds);
  }
  return undefined;
}

/** Deep-scan provider details for retryDelay hints (google.rpc.RetryInfo etc.) */
function findRetryDelay(details: any[]): number | undefined {
  for (const d of details) {
    if (!d || typeof d !== 'object') continue;
    const direct = toRetrySeconds(d.retryDelay) ?? toRetrySeconds(d.retryAfter) ?? toRetrySeconds(d.retry_after);
    if (direct) return direct;
  }
  return undefined;
}

/**
 * Classify an upstream (provider) error into a UI-safe, normalized shape.
 * rawText may be JSON (Google/Gemini style), plain text, or even HTML — all handled.
 * Raw provider JSON is NEVER echoed into the returned message.
 */
export function parseProviderError(rawText: string | null | undefined, httpStatus: number, service = 'ai'): NormalizedProviderError {
  const text = String(rawText ?? '').slice(0, 8000);
  const parsed = text ? safeParseJson(text) : null;

  // Google/Gemini shape: { error: { code, message, status, details: [...] } }
  // Other providers: { message } / { error: { message } } / { detail }
  const inner = parsed?.error && typeof parsed.error === 'object' ? parsed.error : null;
  const providerStatus = String(inner?.status ?? '').toUpperCase();
  const providerMessage = String(inner?.message ?? parsed?.message ?? parsed?.detail ?? '');
  const details: any[] = Array.isArray(inner?.details) ? inner.details : (Array.isArray(parsed?.details) ? parsed.details : []);

  const retryAfter = findRetryDelay(details) ?? toRetrySeconds(parsed?.retry_after) ?? toRetrySeconds(parsed?.retryAfter);

  const haystack = `${providerStatus} ${providerMessage} ${JSON.stringify(details)} ${service}`.toLowerCase() + ' ' + text.toLowerCase().slice(0, 2000);

  const isQuota = httpStatus === 429
    || providerStatus === 'RESOURCE_EXHAUSTED'
    || /resource.?exhaust|quota.?exceed|rate.?limit|too.?many.?request/.test(haystack);
  const isDaily = /per.?day|daily|day.?quota/.test(haystack);
  const isKeyIssue = httpStatus === 401 || httpStatus === 403
    || providerStatus === 'UNAUTHENTICATED' || providerStatus === 'PERMISSION_DENIED'
    || /api.?key.?not.?valid|api_key_invalid|invalid.?api.?key|invalid.?key|permission.?denied|unauthorized|unauthenticated/.test(haystack);
  const isContentBlocked = !isQuota && /content.?blocked|content.?policy|policy.?violation|blocked.?by.?safety/.test(haystack);
  const isModelMissing = !isQuota && !isKeyIssue && (httpStatus === 404 || providerStatus === 'NOT_FOUND'
    || /not.?a.?valid.?model|no.?endpoints?.?found|unknown.?model|invalid.?model/.test(haystack));

  if (isKeyIssue) {
    return {
      code: 'API_KEY_INVALID',
      status: 500,
      message: 'The AI service API key is invalid or unauthorized — this is a server configuration issue, not something you did wrong.',
      action: 'Admin: verify OPENROUTER_API_KEYS in the Vercel project environment variables.',
    };
  }

  // OpenRouter 402 — paid credit pool exhausted on THIS key → rotate/fail over
  if (httpStatus === 402 || /insufficient.?credits|payment.?required|out.?of.?credits/.test(haystack)) {
    return {
      code: 'INSUFFICIENT_CREDITS',
      status: 402,
      message: 'The AI credit pool is temporarily exhausted. Please try again later.',
      action: 'Admin: top up OpenRouter credits or add more keys to OPENROUTER_API_KEYS.',
    };
  }

  if (isQuota) {
    if (isDaily) {
      return {
        code: 'QUOTA_EXCEEDED_DAILY',
        status: 429,
        message: "API quota exceeded — today's AI usage limit has been reached. The daily quota resets around midnight Pacific time (PT).",
        action: 'Try again after the daily reset, or enable billing in Google AI Studio for much higher limits.',
      };
    }
    return {
      code: 'RATE_LIMITED',
      status: 429,
      retryAfter,
      message: retryAfter
        ? `AI is busy — the rate limit was reached. Please wait about ${retryAfter}s and try again.`
        : 'AI is busy right now — too many requests. Please wait a moment and try again.',
      ...(retryAfter ? { action: `Auto-retry after ~${retryAfter} seconds is recommended.` } : {}),
    };
  }

  if (isModelMissing) {
    return {
      code: 'MODEL_NOT_FOUND',
      status: 502,
      message: 'The requested AI model is currently unavailable. Please try again in a moment.',
      action: 'Admin: check the configured OPENROUTER_MODEL against the list of available models.',
    };
  }

  if (isContentBlocked) {
    return {
      code: 'CONTENT_BLOCKED',
      status: 422,
      message: 'The AI could not process this input because it was flagged by safety filters. Please rephrase and try again.',
    };
  }

  if (httpStatus === 400) {
    return { code: 'BAD_REQUEST', status: 400, message: 'The AI service rejected the request. Please adjust the input and try again.' };
  }

  if (httpStatus >= 500) {
    return { code: 'UPSTREAM_ERROR', status: 502, message: 'The AI provider is temporarily unavailable. Please try again shortly.' };
  }

  return {
    code: 'UNKNOWN',
    status: httpStatus >= 400 && httpStatus < 600 ? httpStatus : 502,
    message: 'The AI service returned an unexpected error. Please try again.',
  };
}

/**
 * Build a backward-compatible error Response from a provider failure.
 * Full detail stays SERVER-SIDE (Vercel function logs) — clients only
 * receive the safe, friendly envelope.
 */
export function providerErrorResponse(rawText: string | null | undefined, httpStatus: number, service: string): Response {
  const info = parseProviderError(rawText, httpStatus, service);
  const rawSnippet = String(rawText ?? '').slice(0, 600);
  if (rawSnippet) console.error(`[${service}] upstream HTTP ${httpStatus} → ${info.code} :: ${rawSnippet}`);
  return jsonResponse({
    error: info.message,
    code: info.code,
    service,
    ...(info.retryAfter ? { retryAfter: info.retryAfter } : {}),
    ...(info.action ? { action: info.action } : {}),
  }, info.status);
}

/**
 * Sanitize any thrown error for client responses: maps raw JSON blobs via
 * parseProviderError, redacts query-string API keys, and caps length.
 * NEVER exposes provider internals or secrets to the client.
 */
export function sanitizeThrownError(e: unknown, service: string): string {
  const raw = (e instanceof Error ? e.message : String(e ?? '')) || '';
  const trimmed = raw.trim();
  if (!trimmed) return 'Internal server error';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseProviderError(trimmed, 500, service).message;
  }
  return trimmed
    .replace(/([?&]key=)[A-Za-z0-9_\-]+/gi, '$1[redacted]')
    .slice(0, 240);
}
