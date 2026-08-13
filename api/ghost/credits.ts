/**
 * Vercel Edge Function — GET /api/ghost/credits
 *
 * Returns the caller's Ghost Intelligence credit snapshot: tier,
 * black-ops flag, and per-action {used, limit, remaining, reset_at} for
 * interrogate / squad / recon / dawn_patrol.
 *
 * Read-only, service-worker-callable; authenticated users see their
 * own quotas, guests see all-zero/locked.
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleGhostCredits } from "../_ghostLedger.js";

export default async function handler(req: Request): Promise<Response> {
  return handleGhostCredits(req);
}
