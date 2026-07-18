/**
 * Phase 4 — API Router
 *
 * Maps URL paths to route handlers.
 * Compatible with Vercel Edge Functions and standard Node.js runtimes.
 *
 * Usage (Vercel Edge):
 * ```ts
 * // api/v1/storyboard.ts
 * export const config = { runtime: "edge" };
 * export { handler as default } from "../../apps/api/src/routes";
 * ```
 *
 * Usage (Node.js):
 * ```ts
 * import { router } from "./apps/api/src/routes";
 * const response = await router(new Request("https://...", { method: "POST", body }));
 * ```
 */

import { handleStoryboardV1 } from "./v1/storyboard";
import { handleThumbnailV1 } from "./v1/thumbnail";
import { corsHeaders } from "./shared";

export type RouteMap = Record<string, (req: Request) => Promise<Response>>;

/** Map of pathname → handler. */
const ROUTES: RouteMap = {
  "/v1/storyboard": handleStoryboardV1,
  "/v1/thumbnail": handleThumbnailV1,
};

/**
 * Universal router — call from any runtime.
 *
 * @param req  Standard Fetch API Request.
 * @returns    A Response, or a 404 Response if no route matches.
 */
export async function router(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/+$/, ""); // strip trailing slash

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
    JSON.stringify({
      success: false,
      error: `Route not found: ${pathname}`,
      code: "NOT_FOUND",
    }),
    { status: 404, headers: corsHeaders }
  );
}

/**
 * Default export for Vercel Edge Functions that use the standard
 * function-per-file convention at `api/v1/{name}.ts`:
 *
 * ```ts
 * // api/v1/storyboard.ts
 * export const config = { runtime: "edge" };
 * export default router;
 * ```
 */
export default router;

// Re-export individual handlers for direct use
export { handleStoryboardV1 } from "./v1/storyboard";
export { handleThumbnailV1 } from "./v1/thumbnail";
