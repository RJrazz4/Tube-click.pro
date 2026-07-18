/**
 * Phase 4 — Shared API utilities for route handlers.
 *
 * Provides standardised JSON responses, error envelopes, and CORS
 * headers consistent with the existing `api/_shared.ts` pattern.
 */

// ─── CORS ────────────────────────────────────────────────────────

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-tier",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// ─── Success responses ──────────────────────────────────────────

export function ok<T>(data: T, meta?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      success: true,
      ...meta,
      data,
    }),
    { status: 200, headers: corsHeaders }
  );
}

// ─── Error responses ────────────────────────────────────────────

export interface ApiError {
  success: false;
  error: string;
  code: string;
  /** Validation errors, if applicable. */
  fields?: Array<{ field: string; message: string }>;
  /** Upgrade prompt for tier-limit hits. */
  upgradeMessage?: string;
  /** Provider-level metadata from the generator. */
  providerDetails?: Record<string, unknown>;
}

export function badRequest(
  error: string,
  fields?: Array<{ field: string; message: string }>
): Response {
  const body: ApiError = { success: false, error, code: "BAD_REQUEST" };
  if (fields) body.fields = fields;
  return new Response(JSON.stringify(body), { status: 400, headers: corsHeaders });
}

export function paymentRequired(upgradeMessage: string): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: upgradeMessage,
      code: "UPGRADE_REQUIRED",
      upgradeMessage,
    } satisfies ApiError),
    { status: 402, headers: corsHeaders }
  );
}

export function tooManyRequests(error: string, retryAfter?: number): Response {
  const headers = { ...corsHeaders };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return new Response(
    JSON.stringify({
      success: false,
      error,
      code: "RATE_LIMITED",
      retryAfter,
    } satisfies ApiError),
    { status: 429, headers }
  );
}

export function serverError(error: string): Response {
  console.error("[api] Internal server error:", error);
  return new Response(
    JSON.stringify({
      success: false,
      error: "Internal server error. Please try again.",
      code: "INTERNAL_ERROR",
    } satisfies ApiError),
    { status: 500, headers: corsHeaders }
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Safely parse a Request body as JSON. */
export async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Build dimension map from aspect ratio string. */
export function aspectRatioToDimensions(
  ratio: string
): { width: number; height: number } {
  switch (ratio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1024, height: 1024 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "16:9":
    default:
      return { width: 1920, height: 1080 };
  }
}
