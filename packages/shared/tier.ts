/**
 * Phase 4 — Tier Configuration
 *
 * Defines subscription tiers and their feature limits.
 * Used by the API routes (request validation) and the web UI (alert banners).
 *
 * FREE:  max 4 storyboard scenes
 * PREMIUM: unlimited scenes
 */

export type SubscriptionTier = "free" | "premium";

export interface TierLimits {
  maxScenes: number;
  maxThumbnailsPerGeneration: number;
  allowedBrands: string[];           // ImageModelBrand values the tier can use
  allowedProviders: string[];        // Provider names the tier can access
  json2VideoQuality: "draft" | "medium" | "high";
  watermark: boolean;
}

export const TIER_CONFIG: Record<SubscriptionTier, TierLimits> = {
  free: {
    maxScenes: 4,
    maxThumbnailsPerGeneration: 2,
    allowedBrands: ["Tube.Flash"],
    allowedProviders: ["pollinations"],
    json2VideoQuality: "draft",
    watermark: true,
  },
  premium: {
    maxScenes: Infinity,
    maxThumbnailsPerGeneration: 4,
    allowedBrands: ["Tube.Flash", "Tube.Pro", "Tube.Cinematic"],
    allowedProviders: ["pollinations", "agnes-flash", "gemini-flash"],
    json2VideoQuality: "high",
    watermark: false,
  },
};

/** Resolve limits for a given tier (defaults to "free"). */
export function getTierLimits(tier: SubscriptionTier | string): TierLimits {
  const key = (tier as SubscriptionTier) || "free";
  return TIER_CONFIG[key] || TIER_CONFIG.free;
}

/** True when `scenes` exceeds the tier's max scene count. */
export function exceedsSceneLimit(
  tier: SubscriptionTier | string,
  scenes: number
): boolean {
  const limits = getTierLimits(tier);
  return scenes > limits.maxScenes;
}

/** Clamp a value to the tier's maximum. */
export function clampByTier(
  tier: SubscriptionTier | string,
  value: number,
  field: "maxScenes" | "maxThumbnailsPerGeneration"
): number {
  const limits = getTierLimits(tier);
  const max = limits[field];
  return Math.min(value, max);
}
