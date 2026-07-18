/**
 * Phase F3 — GET /api/v1/tiers: the public plan catalog.
 *
 * Unauthenticated by design (this is pricing-page data, not user data):
 * callers render tier cards straight off F1's catalog. No rate gate —
 * the body is static per boot; edge caches can hold it forever.
 */
import { TierPolicy, type TierCatalogEntry } from "../tiers/index.js";

import type { ApiResponse } from "./types.js";

export interface TiersResponseBody {
  tiers: TierCatalogEntry[];
}

export function handleTiers(deps: { policy: TierPolicy }): ApiResponse {
  const body: TiersResponseBody = { tiers: deps.policy.catalog() };
  return { status: 200, body };
}
