/**
 * Phase 4 — API Router (Phase 6: +metrics)
 *
 * Maps URL paths to route handlers.
 * Compatible with Vercel Edge Functions and standard Node.js runtimes.
 */

import { handleStoryboardV1 } from "./v1/storyboard.js";
import { handleThumbnailV1 } from "./v1/thumbnail.js";
import { handleMetricsV1 } from "./v1/metrics.js";
import { corsHeaders } from "./shared.js";

export type RouteMap = Record<string, (req: Request) => Promise<Response>>;

/** Map of pathname → handler. */
const ROUTES: RouteMap = {
  "/v1/storyboard": handleStoryboardV1,
  "/v1/thumbnail": handleThumbnailV1,
  "/v1/metrics": handleMetricsV1,
};

/**
 * Universal router — call from any runtime.
 */
export async function router(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/+$/, "");

  const handler = ROUTES[pathname];
  if (handler) {
    return handler(req);
  }

  // Health check
  if (pathname === "/health" || pathname === "/v1/health") {
    return new Response(
      JSON.stringify({ status: "ok", version: "1", timestamp: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 404
  return new Response(
    JSON.stringify({ success: false, error: `Route not found: ${pathname}`, code: "NOT_FOUND" }),
    { status: 404, headers: corsHeaders }
  );
}

export default router;

export { handleStoryboardV1 } from "./v1/storyboard.js";
export { handleThumbnailV1 } from "./v1/thumbnail.js";
export { handleMetricsV1 } from "./v1/metrics.js";
