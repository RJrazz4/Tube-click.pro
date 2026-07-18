/**
 * Phase F2 — Truncation semantics: scene lists clipped to the tier cap.
 *
 * The Master Plan's exact contract: when a Manager plan exceeds the
 * tier's maxScenes, the storyboard is clipped and the response carries
 * `truncated: true` plus `remainingScenes` — how many planned scenes the
 * tier did NOT serve. The UI (G2) renders the upsell banner off these
 * two fields; the API (F3) echoes them verbatim.
 *
 * Semantics (all test-locked):
 *   - clipping keeps the FIRST cap scenes by scene.index order — the
 *     storyboard's beginning, not a random subset (array order alone is
 *     not trusted: results are sorted by index first)
 *   - unlimited tiers (maxScenes null) never truncate
 *   - under or exactly at cap: truncated=false, remainingScenes=0
 *   - input arrays are never mutated; the returned list is fresh
 */
import type { ResolvedTierLimit } from "../../shared/env/tier-limits.js";
import type { ScenePlan, UserTier } from "../types/index.js";

import { TierPolicy } from "./tier-policy.js";

export interface SceneTruncation {
  /** First maxScenes scenes by scene.index order (fresh array). */
  scenes: ScenePlan[];
  /** True exactly when planned scenes exceeded the tier cap. */
  truncated: boolean;
  /** Scenes the tier did not serve (0 when truncated is false). */
  remainingScenes: number;
}

/** Pure primitive: clip to a limits row (F3 composes this). */
export function applySceneCap(
  scenes: readonly ScenePlan[],
  limit: ResolvedTierLimit,
): SceneTruncation {
  const sorted = [...scenes].sort((a, b) => a.index - b.index);
  const cap = limit.maxScenes;

  if (cap === null || sorted.length <= cap) {
    return { scenes: sorted, truncated: false, remainingScenes: 0 };
  }
  return {
    scenes: sorted.slice(0, cap),
    truncated: true,
    remainingScenes: sorted.length - cap,
  };
}

/** Convenience: cap straight off the policy for a user tier. */
export function truncateForTier(
  scenes: readonly ScenePlan[],
  tier: UserTier,
  policy: TierPolicy = new TierPolicy(),
): SceneTruncation {
  return applySceneCap(scenes, policy.limits(tier));
}
