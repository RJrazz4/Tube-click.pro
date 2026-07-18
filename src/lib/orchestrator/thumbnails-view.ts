/**
 * Phase G3 — Thumbnails view-model: count options + card mapping.
 *
 * Count selector contract (F1 mirroring + server-authority):
 *   - the selector shows ONLY the counts the user's tier allows
 *     (disallowed options are hidden — there is no click to reject)
 *   - options come from GET /api/v1/tiers when reachable
 *   - offline/unreachable → FALLBACK_TIER_CATALOG (plan F1 values);
 *     the server still validates every request, so a stale catalog
 *     degrades to an honest 400, never a security hole
 */
import {
  brandBadge,
  latencyLabel,
  type SceneCardView,
} from "./storyboard-view";
import type {
  EngineTier,
  OrchestratorThumbnailsResponse,
  TierCatalogEntry,
} from "./types";

export const ALL_THUMBNAIL_COUNTS = [1, 2, 4] as const;

/** Plan F1 values mirrored; used until/unless GET /api/v1/tiers answers. */
export const FALLBACK_TIER_CATALOG: TierCatalogEntry[] = [
  { tier: "free", maxScenes: 4, unlimitedScenes: false, thumbnailOptions: [1, 2] },
  { tier: "pro", maxScenes: 8, unlimitedScenes: false, thumbnailOptions: [1, 2, 4] },
  { tier: "cinematic", maxScenes: null, unlimitedScenes: true, thumbnailOptions: [1, 2, 4] },
];

/** Allowed thumbnail counts for a tier, ascending. Unknown tier → free's. */
export function allowedThumbnailCounts(
  catalog: readonly TierCatalogEntry[],
  tier: EngineTier,
): number[] {
  const entry =
    catalog.find((row) => row.tier === tier) ??
    catalog.find((row) => row.tier === "free");
  const options = entry?.thumbnailOptions ?? [1];
  return [...options].sort((a, b) => a - b);
}

/**
 * Clamp a requested count into the allowed set: exact match wins; the
 * nearest lower allowed count otherwise; never above the tier maximum.
 */
export function clampThumbnailCount(allowed: readonly number[], requested: number): number {
  if (allowed.length === 0) return 1;
  const atMost = [...allowed].filter((count) => count <= requested);
  return atMost.length > 0 ? Math.max(...atMost) : allowed[0];
}

export interface ThumbnailOptionView {
  count: number;
  /** "1 option" / "2 options" / "4 options" */
  label: string;
}

export function thumbnailOptionViews(
  catalog: readonly TierCatalogEntry[],
  tier: EngineTier,
): ThumbnailOptionView[] {
  return allowedThumbnailCounts(catalog, tier).map((count) => ({
    count,
    label: `${count} option${count === 1 ? "" : "s"}`,
  }));
}

/** Response rows → Option N cards (same badge semantics as storyboard). */
export function toThumbnailCardViews(body: OrchestratorThumbnailsResponse): SceneCardView[] {
  return body.thumbnails.map((row) => {
    const view: SceneCardView = {
      sceneIndex: row.sceneIndex,
      title: `Option ${row.sceneIndex + 1}`,
      status: row.status,
      qualityBadge: brandBadge(row.costTier),
      backupBadge: row.isFallback,
      latencyLabel: latencyLabel(row.latencyMs),
    };
    if (row.imageUrl !== undefined) view.imageUrl = row.imageUrl;
    if (row.error !== undefined) view.errorMessage = row.error;
    return view;
  });
}

/** filename for one option download: "thumbnail-option-1.png" */
export function optionFilename(sceneIndex: number): string {
  return `thumbnail-option-${sceneIndex + 1}.png`;
}
