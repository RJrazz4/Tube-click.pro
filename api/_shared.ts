/**
 * Shared helpers for Vercel Edge Functions — secure, server-only keys
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
 * Phase F1 — OpenRouter configuration (OpenAI-compatible chat completions)
 * Provider migration: direct Gemini REST → OpenRouter with API-key rotation.
 * ------------------------------------------------------------------ */
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Primary model (OpenRouter path) — override via OPENROUTER_MODEL */
export const OPENROUTER_MODEL = "google/gemini-2.5-flash";
/** Fallback chain (CSV) — override via OPENROUTER_MODEL_FALLBACKS */
export const OPENROUTER_MODEL_FALLBACKS = ["google/gemini-2.5-flash-lite"];
/* NOTE (Phase F2, live-verified via https://openrouter.ai/api/v1/models on 2026-07-17):
 * The 2.0 model paths are RETIRED on OpenRouter and every request 400s.
 * 2.5-flash / 2.5-flash-lite are the direct successors (same tier, support
 * response_format + temperature, 1M context). */

export function extractGeminiText(data: any) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("\n")
    .trim();
}

/* ------------------------------------------------------------------ *
 * Phase F1 — OpenRouter fetching: API-KEY ROTATION + model fallback
 * ------------------------------------------------------------------ */

export interface OpenRouterFetchOutcome {
  /** Final Response (ok, or the last error if everything failed) */
  res: Response;
  /** OpenRouter model id that produced `res` (e.g. "google/gemini-2.0-flash-lite") */
  model: string;
  /** Models attempted, in order — key material is NEVER recorded */
  attempted: string[];
  /** True when key rotation and/or model failover actually happened */
  failedOver: boolean;
}

/** OPENROUTER_API_KEYS=sk-or-1,sk-or-2,... → trimmed, deduped array. Throws a clear config error when empty. */
export function openRouterKeys(): string[] {
  const raw = (process.env.OPENROUTER_API_KEYS || "").trim();
  const unique = [...new Set(raw.split(",").map(k => k.trim()).filter(Boolean))];
  if (!unique.length) {
    throw new Error("OPENROUTER_API_KEYS not configured on server. Set a comma-separated list of OpenRouter keys (key1,key2,key3) in the Vercel project env vars.");
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

/** Error classes where sleeping is useless — rotating key/model IS the fix */
const OR_ROTATE_CODES = new Set(["RATE_LIMITED", "QUOTA_EXCEEDED_DAILY", "INSUFFICIENT_CREDITS", "API_KEY_INVALID"]);

/**
 * Fetch OpenRouter with API-KEY ROTATION and MODEL FAILOVER.
 *
 * Policy (Phase F1 spec):
 *  1. Model loop (chain of models), inner KEY loop (rotation): for each model, try key1, key2, ...
 *  2. 429 quota/rate-limit, 402 insufficient credits, 401/403 invalid key → rotate to the
 *     next key INSTANTLY; when every key is spent → next model, keys reset.
 *  3. Provider Retry-After header → honored ONCE per (model,key) if it fits the budget.
 *  4. 5xx → one short backoff on the same key, then rotate.
 *  5. Non-429 4xx (bad request) → identical across keys/models → fail fast (1 request).
 *  Total sleep bounded by AI_RETRY_BUDGET_MS (default 12000) to stay inside edge maxDuration.
 *  Key material is never logged or returned — rotation logs reference key index only.
 */
export async function fetchOpenRouterWithRetry(geminiStyleBody: any): Promise<OpenRouterFetchOutcome> {
  const keys = openRouterKeys();
  const models = openRouterModelChain();
  const RETRY_BUDGET_MS = Math.max(0, parseInt(process.env.AI_RETRY_BUDGET_MS || process.env.GEMINI_RETRY_BUDGET_MS || "12000", 10) || 12000);
  const t0 = Date.now();

  const attempted: string[] = [];
  let keysTried = 0;
  let lastRes: Response | null = null;
  let lastModel = models[0];
  let lastOrBody: any = null;

  for (const model of models) {
    if (!attempted.includes(model)) attempted.push(model);
    const orBody = toOpenRouterBody(geminiStyleBody, model);
    lastOrBody = orBody;

    keysLoop: for (let ki = 0; ki < keys.length; ki++) {
      keysTried++;
      for (let attempt = 0; attempt < 2; attempt++) {
        lastRes = await fetch(OPENROUTER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${keys[ki]}`,
            // Phase F2: env-driven attribution headers — no literal <YOUR_SITE_*> placeholders
            "X-Title": process.env.OPENROUTER_SITE_TITLE || "TubeClick.Pro",
            ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
          },
          body: JSON.stringify(orBody),
        });
        lastModel = model;

        const failedOver = attempted.length > 1 || keysTried > 1;
        if (lastRes.ok) return { res: lastRes, model, attempted, failedOver };

        const errText = await lastRes.clone().text().catch(() => "");
        const info = parseProviderError(errText, lastRes.status, "openrouter");
        console.error(`[openrouter] ${info.code} (HTTP ${lastRes.status}) model=${model} key#${ki + 1}/${keys.length}`);

        if (attempt === 0 && info.code === "RATE_LIMITED") {
          const raSec = toRetrySeconds(lastRes.headers.get("retry-after") || undefined);
          if (raSec && raSec * 1000 <= 15000 && (Date.now() - t0 + raSec * 1000) <= RETRY_BUDGET_MS) {
            await sleepMsOR(Math.round(raSec * 1000 * (1 + 0.1 * Math.random())));
            continue;
          }
        }

        if (OR_ROTATE_CODES.has(info.code)) break;

        // Invalid/retired model ID is doomed for EVERY key on that model:
        // skip ALL remaining keys and jump straight to the next model in the chain.
        if (info.code === "MODEL_NOT_FOUND") break keysLoop;

        if (attempt === 0 && info.code === "UPSTREAM_ERROR" && (Date.now() - t0 + 1500) <= RETRY_BUDGET_MS) {
          await sleepMsOR(Math.round(1500 * (1 + 0.2 * Math.random())));
          continue;
        }

        // Phase F2: log the exact (auth-free) outbound payload on fatal errors so
        // Vercel logs show precisely what the provider rejected — speeds up future 400 audits.
        console.error(`[openrouter] fatal on model=${model} key#${ki + 1} — outbound snapshot: ${JSON.stringify(orBody).slice(0, 1200)}`);
        return { res: lastRes, model, attempted, failedOver: attempted.length > 1 || keysTried > 1 };
      }
    }
  }

  if (lastOrBody) {
    console.error(`[openrouter] ALL keys x models exhausted — last outbound snapshot: ${JSON.stringify(lastOrBody).slice(0, 1200)}`);
  }
  return { res: lastRes!, model: lastModel, attempted, failedOver: attempted.length > 1 || keysTried > 1 };
}

export function cleanupJson(value: string) {
  return value.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
}

/* ------------------------------------------------------------------ *
 * Phase 1 — Upstream provider error normalization
 * Never leak raw provider payloads (Google/Gemini JSON blobs, HTML, or
 * internals) to clients. The envelope stays BACKWARD COMPATIBLE:
 * `error` remains a friendly STRING (existing clients keep working);
 * the new machine-readable `code` (+ optional retryAfter/action) is
 * added for the upgraded client arriving in Phase 3.
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
