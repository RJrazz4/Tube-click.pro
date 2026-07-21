/**
 * Phase 5 — useTierConfig
 *
 * Reactive hook for subscription tier awareness.
 * Reads the user's tier from the Zustand app store and provides
 * tier limits, feature checks, and upgrade messaging.
 *
 * Integrates with:
 *   - Phase 4: packages/shared/tier.ts (tier config constants)
 *   - Existing: src/stores/useAppStore.ts (persisted tier state)
 *   - Pro access: qualified referral rewards
 */

import { useMemo } from "react";
import { useAppStore } from "@/stores/useAppStore";
import {
  getTierLimits,
  exceedsSceneLimit,
  clampByTier,
  type SubscriptionTier as TierFromConfig,
} from "../../packages/shared/tier";
export type AppTier = "free" | "pro" | "enterprise";

/**
 * Normalise the application tier to the shared TierConfig type.
 * "pro" and "enterprise" both map to "premium" for feature limits.
 */
function toConfigTier(tier: AppTier): TierFromConfig {
  if (tier === "free") return "free";
  return "premium"; // pro & enterprise → premium tier
}

export interface TierInfo {
  /** Raw tier from the app store. */
  rawTier: AppTier;
  /** Normalised tier for config lookups (free | premium). */
  configTier: TierFromConfig;
  /** Whether the user is on a paid plan. */
  isPremium: boolean;
  /** Max storyboard scenes allowed. */
  maxScenes: number;
  /** Max thumbnails per generation allowed. */
  maxThumbnails: number;
  /** Allowed image brands for this tier. */
  allowedBrands: string[];
  /** Whether the output has a watermark. */
  hasWatermark: boolean;
  /** Whether the tier restricts the user for the given scene count. */
  exceedsSceneLimit(scenes: number): boolean;
  /** Clamp a value to the tier's maximum for the given field. */
  clampValue(value: number, field: "maxScenes" | "maxThumbnailsPerGeneration"): number;
  /** Upgrade message shown when a feature is locked. */
  upgradeMessage: string;
}

/**
 * Subscribe to the user's current tier and derive all feature limits.
 * Re-memoizes whenever the tier changes.
 */
export function useTierConfig(): TierInfo {
  const rawTier = useAppStore((s) => s.tier);

  return useMemo(() => {
    const configTier = toConfigTier(rawTier);
    const limits = getTierLimits(configTier);
    const isPremium = rawTier !== "free";

    return {
      rawTier,
      configTier,
      isPremium,
      maxScenes: limits.maxScenes,
      maxThumbnails: limits.maxThumbnailsPerGeneration,
      allowedBrands: limits.allowedBrands,
      hasWatermark: limits.watermark,
      exceedsSceneLimit: (scenes: number) => exceedsSceneLimit(configTier, scenes),
      clampValue: (value: number, field) => clampByTier(configTier, value, field),
      upgradeMessage:
        rawTier === "free"
          ? `You're on the Free plan (${limits.maxScenes === Infinity ? "unlimited" : limits.maxScenes} scenes, ${limits.allowedBrands.join(", ")} only). Unlock Pro for free through Referral Rewards for expanded limits, all brands, and watermark-free output.`
          : "",
    };
  }, [rawTier]);
}
