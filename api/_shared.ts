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

// GEMINI model constant
export const GEMINI_MODEL = "gemini-2.0-flash";
export const RETRY_DELAYS = [2000, 5000, 10000];

export function extractGeminiText(data: any) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("\n")
    .trim();
}

export async function fetchGeminiWithRetry(url: string, body: unknown): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1];
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      await new Promise(r => setTimeout(r, Math.round(delay + jitter)));
    }
    last = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (last.ok || (last.status < 500 && last.status !== 429)) return last;
    if (attempt === RETRY_DELAYS.length) return last;
  }
  return last!;
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
  const isModelMissing = !isQuota && !isKeyIssue && (httpStatus === 404 || providerStatus === 'NOT_FOUND');

  if (isKeyIssue) {
    return {
      code: 'API_KEY_INVALID',
      status: 500,
      message: 'The AI service API key is invalid or unauthorized — this is a server configuration issue, not something you did wrong.',
      action: 'Admin: verify GEMINI_API_KEY in the Vercel project environment variables.',
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
      action: 'Admin: check the configured GEMINI_MODEL against the list of available models.',
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
