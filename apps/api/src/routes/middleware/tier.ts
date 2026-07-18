/**
 * Phase 4 — Tier Enforcement Middleware
 *
 * Intercepts requests before the route handler to:
 *   1. Detect the user's subscription tier (from the request `tier` field,
 *      or from auth context in production).
 *   2. Validate the request against tier limits (scene count, brand, etc.).
 *   3. Truncate or reject requests that exceed limits — with a clear
 *      user-friendly message and upgrade prompt.
 *
 * Exports a pure function that can be composed in any route handler.
 */

import { getTierLimits, exceedsSceneLimit, clampByTier, type SubscriptionTier } from "../../../../../packages/shared/tier";
import type { ValidationError } from "../validation/storyboard";

// ─── Public types ────────────────────────────────────────────────

export interface TierEnforcementResult {
  /** Whether the request passes tier checks. */
  allowed: boolean;
  /** If not allowed, the reason. */
  reason?: string;
  /** User-friendly upgrade prompt. */
  upgradeMessage?: string;
  /** Corrected/truncated values the handler should use (mutated input). */
  corrections?: {
    sceneCount?: number;
    brand?: string;
    thumbnailCount?: number;
  };
  /** Tier that was enforced. */
  tier: SubscriptionTier;
}

// ─── Middleware ──────────────────────────────────────────────────

/**
 * Enforce tier limits for a storyboard request.
 *
 * @param tier      The user's subscription tier.
 * @param sceneCount Number of scenes the user is requesting.
 * @param brand      Requested image brand.
 * @returns          Enforcement result with corrections if truncated.
 */
export function enforceStoryboardTier(
  tier: SubscriptionTier | string,
  sceneCount: number,
  brand: string
): TierEnforcementResult {
  const limits = getTierLimits(tier);

  // Check brand access
  if (!limits.allowedBrands.includes(brand as any)) {
    const allowedBrand = limits.allowedBrands[0] || "Tube.Flash";
    return {
      allowed: true, // Still allowed — we downgrade the brand
      corrections: { brand: allowedBrand },
      tier: tier as SubscriptionTier,
    };
  }

  // Check scene count
  if (exceedsSceneLimit(tier, sceneCount)) {
    const maxScenes = limits.maxScenes;
    return {
      allowed: true, // Still allowed — we truncate scenes
      corrections: { sceneCount: maxScenes },
      tier: tier as SubscriptionTier,
      upgradeMessage:
        tier === "free"
          ? `Free plan limited to ${maxScenes} scenes. Upgrade to Premium for unlimited scenes, cinematic quality, and more.`
          : undefined,
    };
  }

  return { allowed: true, tier: tier as SubscriptionTier };
}

/**
 * Enforce tier limits for a thumbnail request.
 *
 * @param tier  The user's subscription tier.
 * @param count Requested number of thumbnails.
 * @param brand Requested image brand.
 * @returns     Enforcement result with corrections if truncated.
 */
export function enforceThumbnailTier(
  tier: SubscriptionTier | string,
  count: number,
  brand: string
): TierEnforcementResult {
  const limits = getTierLimits(tier);

  // Check brand access
  if (!limits.allowedBrands.includes(brand as any)) {
    const allowedBrand = limits.allowedBrands[0] || "Tube.Flash";
    return {
      allowed: true,
      corrections: { brand: allowedBrand },
      tier: tier as SubscriptionTier,
    };
  }

  // Clamp thumbnail count to tier max
  const clampedCount = clampByTier(tier, count, "maxThumbnailsPerGeneration");
  if (clampedCount !== count) {
    return {
      allowed: true,
      corrections: { thumbnailCount: clampedCount },
      tier: tier as SubscriptionTier,
      upgradeMessage:
        tier === "free"
          ? `Free plan limited to ${clampedCount} thumbnail${clampedCount > 1 ? "s" : ""}. Upgrade to Premium for up to 4 thumbnails with cinematic quality.`
          : undefined,
    };
  }

  return { allowed: true, tier: tier as SubscriptionTier };
}

// ─── Helpers ─────────────────────────────────────────────────────

export function tierFromRequest(headers: Headers, bodyTier?: string): SubscriptionTier {
  // In production, this would verify a JWT or session token.
  // For now, trust the client-supplied tier (consistent with existing pattern).
  // Premium override via server env for testing:
  if (typeof process !== "undefined" && process.env?.FORCE_PREMIUM === "true") {
    return "premium";
  }
  if (bodyTier === "premium" || bodyTier === "free") {
    return bodyTier;
  }
  // Header override (e.g. from auth middleware)
  const hdr = headers.get("x-tier");
  if (hdr === "premium") return "premium";
  return "free";
}
