/**
 * Phase F — Business layer public surface.
 *   F1 tier-policy → plan tier enforcement over A1's TIER_LIMITS
 *   F2 truncate    → scene lists clipped to cap; truncated + remainingScenes
 */
export * from "./tier-policy.js";
export * from "./truncate.js";
