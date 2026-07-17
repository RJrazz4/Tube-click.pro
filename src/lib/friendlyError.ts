/**
 * Phase E3 — Central friendly-error mapper (client defense-in-depth).
 *
 * Converts ANY thrown value — typed EdgeFunctionError (Phase E1/E2 envelopes),
 * legacy RAW provider JSON strings, network/abort errors, or plain strings —
 * into a clean, UI-ready shape. Raw provider JSON is classified, never rendered.
 */

export interface FriendlyError {
  /** Mirrors server codes: QUOTA_EXCEEDED_DAILY | RATE_LIMITED | API_KEY_INVALID | MODEL_NOT_FOUND | CONTENT_BLOCKED | BAD_REQUEST | UPSTREAM_ERROR | NETWORK | TIMEOUT | AUTH | INTERNAL | UNKNOWN */
  code: string;
  /** Short headline (toast title / card header) */
  title: string;
  /** User-safe sentence(s) — never contains raw JSON */
  message: string;
  /** Seconds to wait before retrying, when the provider told us */
  retryAfter?: number;
  /** Optional next-step guidance */
  action?: string;
}

const CODE_MAP: Record<string, { title: string; message: string; action?: string }> = {
  QUOTA_EXCEEDED_DAILY: {
    title: "Daily AI quota reached",
    message: "Today's AI usage limit is exhausted. The quota resets around midnight Pacific time (PT) — your work is saved locally, so you can safely come back then.",
  },
  RATE_LIMITED: {
    title: "AI is busy",
    message: "The AI hit a rate limit. Please wait a few seconds and try again.",
  },
  API_KEY_INVALID: {
    title: "Configuration issue",
    message: "The AI service key is invalid or unauthorized — this is a server-side configuration issue, not something you did.",
  },
  MODEL_NOT_FOUND: {
    title: "Model unavailable",
    message: "The requested AI model is currently unavailable. Please try again shortly.",
  },
  CONTENT_BLOCKED: {
    title: "Input flagged",
    message: "The AI could not process this input due to safety filters. Please rephrase and try again.",
  },
  BAD_REQUEST: {
    title: "Request rejected",
    message: "The AI service rejected the request. Please adjust the input and try again.",
  },
  UPSTREAM_ERROR: {
    title: "Provider hiccup",
    message: "The AI provider is temporarily unavailable. Trying again in a moment usually works.",
  },
  NETWORK: {
    title: "Connection issue",
    message: "Could not reach the server. Check your internet connection and try again.",
  },
  TIMEOUT: {
    title: "Request timed out",
    message: "The request took too long to complete. Please try again.",
  },
  AUTH: {
    title: "Session issue",
    message: "Your session could not be verified. Please refresh the page and try again.",
  },
  INTERNAL: {
    title: "Something went wrong",
    message: "An unexpected error occurred. Please try again.",
  },
  UNKNOWN: {
    title: "Something went wrong",
    message: "An unexpected error occurred. Please try again.",
  },
};

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return t.startsWith("{") || t.startsWith("[");
}

function toSeconds(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.ceil(v);
  if (typeof v === "string") {
    const m = v.trim().match(/^([\d.]+)\s*s(?:econds?)?$/i);
    if (m) return Math.max(1, Math.ceil(parseFloat(m[1])));
    const n = parseInt(v, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return undefined;
}

/**
 * Classify a raw (possibly legacy / non-normalized) error string.
 * Handles Google's JSON shape, plain text, and HTML — never trusts the content.
 */
function classifyRawText(raw: string, httpStatus: number): { code: string; retryAfter?: number } {
  const trimmed = (raw || "").slice(0, 6000);
  let parsed: any = null;
  if (looksLikeJson(trimmed)) {
    try { parsed = JSON.parse(trimmed); } catch { /* plain text */ }
  }

  const inner = parsed?.error && typeof parsed.error === "object" ? parsed.error : null;
  const status = String(inner?.status ?? "").toUpperCase();
  const msg = String(inner?.message ?? parsed?.message ?? trimmed);
  const details: any[] = Array.isArray(inner?.details) ? inner.details : Array.isArray(parsed?.details) ? parsed.details : [];

  let retryAfter: number | undefined;
  for (const d of details) {
    const s = toSeconds(d?.retryDelay) ?? toSeconds(d?.retryAfter);
    if (s) { retryAfter = s; break; }
  }
  retryAfter = retryAfter ?? toSeconds(parsed?.retry_after) ?? toSeconds(parsed?.retryAfter);

  const hay = `${status} ${msg} ${JSON.stringify(details)}`.toLowerCase();

  if (httpStatus === 429 || status === "RESOURCE_EXHAUSTED" || /resource.?exhaust|quota.?exceed|rate.?limit|too.?many.?request/.test(hay)) {
    return /per.?day|daily|day.?quota/.test(hay)
      ? { code: "QUOTA_EXCEEDED_DAILY" }
      : { code: "RATE_LIMITED", retryAfter };
  }
  if (httpStatus === 401 || httpStatus === 403 || /api.?key.?not.?valid|api_key_invalid|invalid.?api.?key|permission.?denied|unauthenticated/.test(hay)) {
    return { code: "API_KEY_INVALID" };
  }
  if (/content.?blocked|content.?policy|policy.?violation|blocked.?by.?safety/.test(hay)) return { code: "CONTENT_BLOCKED" };
  if (httpStatus === 404 || status === "NOT_FOUND") return { code: "MODEL_NOT_FOUND" };
  if (httpStatus === 400 || status === "INVALID_ARGUMENT") return { code: "BAD_REQUEST" };
  if (httpStatus >= 500) return { code: "UPSTREAM_ERROR" };
  return { code: "UNKNOWN", retryAfter };
}

function inferFromTransport(raw: string, httpStatus: number): string | null {
  const m = raw.toLowerCase();
  if (/failed to fetch|networkerror|load failed/.test(m)) return "NETWORK";
  if (/timed?\s?out|aborted|deadline/.test(m)) return "TIMEOUT";
  if (httpStatus === 429) return "RATE_LIMITED";
  if (httpStatus >= 500) return "UPSTREAM_ERROR";
  return null;
}

/**
 * Map any thrown error to a UI-safe FriendlyError.
 * Priority: typed envelope fields → raw/legacy classification → transport heuristics.
 */
export function friendlyError(err: unknown, fallback?: string): FriendlyError {
  const anyErr: any = err && typeof err === "object" ? err : null;
  const httpStatus: number = typeof anyErr?.status === "number" ? anyErr.status : 0;
  const typedCode: string | undefined = typeof anyErr?.code === "string" ? anyErr.code : undefined;
  const typedRetry: number | undefined = typeof anyErr?.retryAfter === "number" ? anyErr.retryAfter : undefined;
  const typedAction: string | undefined = typeof anyErr?.action === "string" ? anyErr.action : undefined;
  const rawMessage: string = err instanceof Error ? err.message : typeof err === "string" ? err : "";

  if (anyErr?.name === "AbortError") return { code: "TIMEOUT", ...CODE_MAP.TIMEOUT };

  // Unknown / empty error
  if (!anyErr && !rawMessage) {
    return { code: "UNKNOWN", ...CODE_MAP.UNKNOWN, ...(fallback ? { message: fallback } : {}) };
  }

  let code = typedCode;
  let retryAfter = typedRetry;
  if (!code) {
    if (looksLikeJson(rawMessage)) {
      const cls = classifyRawText(rawMessage, httpStatus);
      code = cls.code;
      retryAfter = retryAfter ?? cls.retryAfter;
    }
    if (!code || code === "UNKNOWN") {
      code = inferFromTransport(rawMessage, httpStatus) ?? code ?? "UNKNOWN";
    }
  }

  const base = CODE_MAP[code] ?? CODE_MAP.UNKNOWN;

  // A short, clean message from the server is already friendly — keep it.
  // (Typed envelopes carry one; legacy clean strings pass through too.)
  // Markup (HTML error pages) and JSON fragments are NEVER considered clean.
  const hasMarkup = /<[a-z][\s\S]*?>|<\/[a-z]+>/i.test(rawMessage);
  const hasJsonFrag = /"(code|status|details|violations|error)"\s*:\s*/.test(rawMessage);
  const isClean = rawMessage && !looksLikeJson(rawMessage) && !hasMarkup && !hasJsonFrag && rawMessage.length <= 220 && !/[\r\n]/.test(rawMessage);
  const message = typedCode
    ? (isClean ? rawMessage : base.message)
    : code === "UNKNOWN" || code === "AUTH"
      ? (fallback ?? (isClean ? rawMessage : base.message))
      : base.message;

  return { code: code!, title: base.title, message, retryAfter, action: typedAction ?? base.action };
}
