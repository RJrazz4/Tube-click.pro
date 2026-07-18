/**
 * Vercel Edge Function — GET /api/v1/tiers
 *
 * Authoritative tier catalog for the orchestrator UI (count selectors,
 * scene caps, brand access). Values are derived from the SAME TIER_CONFIG
 * the generation endpoints enforce (packages/shared/tier.ts), so the
 * catalog can never promise more than the server allows.
 *
 * The server currently enforces a binary free|premium split, so the UI's
 * "pro" and "cinematic" engine tiers both map to premium limits.
 * Infinity values are serialized as null + unlimitedScenes: true.
 *
 * Runtime: edge — <50ms cold start for US audience.
 */

import { ok, handleOptions, corsHeaders } from "../../apps/api/src/routes/shared.js";
import { TIER_CONFIG } from "../../packages/shared/tier.js";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const free = TIER_CONFIG.free;
  const premium = TIER_CONFIG.premium;

  return ok({
    tiers: [
      {
        tier: "free",
        maxScenes: free.maxScenes,
        unlimitedScenes: false,
        thumbnailOptions: [1, free.maxThumbnailsPerGeneration],
      },
      {
        tier: "pro",
        maxScenes: null, // server premium = unlimited (Infinity is not JSON-safe)
        unlimitedScenes: true,
        thumbnailOptions: [1, 2, premium.maxThumbnailsPerGeneration],
      },
      {
        tier: "cinematic",
        maxScenes: null,
        unlimitedScenes: true,
        thumbnailOptions: [1, 2, premium.maxThumbnailsPerGeneration],
      },
    ],
  });
}
