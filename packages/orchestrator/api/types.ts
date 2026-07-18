/**
 * Phase F3 — API transport types: runtime-agnostic request/response.
 *
 * Handlers return ApiResponse { status, body, headers } so ANY runtime
 * (Supabase edge function, express, H3's test harness, a future worker)
 * can mount them unchanged. Auth arrives ALREADY RESOLVED — clients
 * never self-declare a tier; upstream middleware maps credentials to
 * ApiAuth { tier, clientId }.
 */
import type { UserTier } from "../types/index.js";

export interface ApiAuth {
  tier: UserTier;
  /** Stable identity for F4 rate limiting (user id / key id / ip hash). */
  clientId: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export const API_ERROR_CODES = [
  "invalid_request",
  "thumbnail_count_not_allowed",
  "planner_unavailable",
  "rate_limit_exceeded",
  "internal_error",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

/** Structured error payload — every non-2xx this API emits. */
export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  headers?: Record<string, string>,
): ApiResponse {
  const error: ApiErrorBody["error"] = { code, message };
  if (details !== undefined) error.details = details;
  const response: ApiResponse = { status, body: { error } };
  if (headers !== undefined) response.headers = headers;
  return response;
}

/* ------------------------------------------------------------------ *
 * F4 seam: the rate-limit gate. F3 owns the wire shape (headers,
 * verdict); F4's TierRateLimiter implements RateLimitGate.
 * ------------------------------------------------------------------ */

export interface RateLimitVerdict {
  allowed: boolean;
  /** Bucket capacity for this tier's rule. */
  limit: number;
  /** Tokens remaining AFTER this request (0 when denied). */
  remaining: number;
  /** Seconds until the next token — present when denied. */
  retryAfterSeconds?: number;
  /** Epoch seconds when the bucket will be full again. */
  resetAtSeconds: number;
}

/** Structural gate seam — F4's TierRateLimiter satisfies this. */
export interface RateLimitGate {
  check(tier: UserTier, clientId: string): RateLimitVerdict;
}

/** Wire headers for a verdict; Retry-After only when denied. */
export function rateLimitHeaders(verdict: RateLimitVerdict): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(verdict.limit),
    "X-RateLimit-Remaining": String(verdict.remaining),
    "X-RateLimit-Reset": String(verdict.resetAtSeconds),
  };
  if (!verdict.allowed && verdict.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(verdict.retryAfterSeconds);
  }
  return headers;
}

export interface GateOutcome {
  /** Headers every response (allowed or denied) should carry. */
  headers?: Record<string, string>;
  /** Fully-formed 429 when the gate denied the request. */
  deniedResponse?: ApiResponse;
}

/** Run the limiter once per request — BEFORE any expensive work. */
export function rateLimitGate(auth: ApiAuth, limiter: RateLimitGate | undefined): GateOutcome {
  if (limiter === undefined) return {};
  const verdict = limiter.check(auth.tier, auth.clientId);
  const headers = rateLimitHeaders(verdict);
  if (!verdict.allowed) {
    return {
      headers,
      deniedResponse: errorResponse(
        429,
        "rate_limit_exceeded",
        `tier "${auth.tier}" rate limit exceeded — retry in ${verdict.retryAfterSeconds ?? 1}s`,
        undefined,
        headers,
      ),
    };
  }
  return { headers };
}

/** Merge gate headers onto an outgoing response. */
export function withHeaders(
  response: ApiResponse,
  headers: Record<string, string> | undefined,
): ApiResponse {
  if (headers === undefined) return response;
  return { ...response, headers: { ...headers, ...response.headers } };
}

/** err → printable string (Error.message or String()). */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
