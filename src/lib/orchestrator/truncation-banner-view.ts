/**
 * Phase G2 — Truncation banner view-model: cap echo → upsell copy.
 *
 * Pure mapping from the F3/F2 truncation fields to the banner the user
 * sees. Copy rules (unit-locked):
 *   - nothing rendered when truncated is false
 *   - free → Pro upsell (cap 4 → 8); pro → Cinematic upsell (8 → ∞)
 *   - a truncated cinematic response is only possible via an env-capped
 *     deployment — banner shows counts without an upsell CTA
 *   - grammar is exact (singular/plural), strings are Gate 4 clean
 */
import type { EngineTier, OrchestratorStoryboardResponse } from "./types";

/** Plan F1 caps, mirrored for copy (server may override via env; the
 *  banner always quotes the RESPONSE numbers, these only name tiers). */
export const ENGINE_TIER_COPY: Record<
  EngineTier,
  { label: string; capLabel: string }
> = {
  free: { label: "Free", capLabel: "up to 4 scenes" },
  pro: { label: "Pro", capLabel: "up to 8 scenes" },
  cinematic: { label: "Cinematic", capLabel: "unlimited scenes" },
};

export interface TruncationBannerView {
  remainingScenes: number;
  plannedScenes: number;
  generatedScenes: number;
  /** Tier whose upgrade unlocks the rest; null = nothing to upsell. */
  upgradeTier: Exclude<EngineTier, "free"> | null;
  title: string;
  message: string;
  ctaLabel: string | null;
}

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

export function toTruncationBanner(
  body: OrchestratorStoryboardResponse,
): TruncationBannerView | null {
  if (!body.truncated || body.remainingScenes <= 0) return null;

  const title = `${plural(body.remainingScenes, "more scene")} waiting beyond your plan`;
  const tierLabel = ENGINE_TIER_COPY[body.tier].label;
  const tierCap = ENGINE_TIER_COPY[body.tier].capLabel;

  if (body.tier === "cinematic") {
    // Only reachable when the deployment env-caps cinematic; honest, no upsell.
    return {
      remainingScenes: body.remainingScenes,
      plannedScenes: body.plannedScenes,
      generatedScenes: body.generatedScenes,
      upgradeTier: null,
      title,
      message:
        `The director planned ${plural(body.plannedScenes, "scene")}, and ` +
        `${plural(body.generatedScenes, "scene")} made it onto this storyboard.`,
      ctaLabel: null,
    };
  }

  const upgradeTier = body.tier === "free" ? ("pro" as const) : ("cinematic" as const);
  const upgradeLabel = ENGINE_TIER_COPY[upgradeTier].label;
  const upgradeCap = ENGINE_TIER_COPY[upgradeTier].capLabel;

  return {
    remainingScenes: body.remainingScenes,
    plannedScenes: body.plannedScenes,
    generatedScenes: body.generatedScenes,
    upgradeTier,
    title,
    message:
      `The director planned ${plural(body.plannedScenes, "scene")} — ${tierLabel} renders ` +
      `${tierCap} per storyboard. ${upgradeLabel} unlocks ${upgradeCap}.`,
    ctaLabel: `See ${upgradeLabel} plans`,
  };
}
