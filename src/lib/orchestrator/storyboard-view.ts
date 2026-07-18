/**
 * Phase G1 — Storyboard view-model: API rows → render-ready card views.
 *
 * Pure mapping, fully unit-tested, zero React. Every user-facing string
 * the storyboard UI renders is produced HERE, so Gate 4 copy safety is
 * enforced by a unit test (no infrastructure names can ever leak into a
 * badge or banner line, regardless of what the wire carries).
 *
 * Brand mapping (existing product convention — lib/brandCopy):
 *   costTier "free"    → "Tube.Flash"
 *   costTier "premium" → "Tube.Pro"
 *   isFallback         → "+ backup engine" qualifier
 */
import type {
  EngineTier,
  OrchestratorStoryboardResponse,
  OrchestratorSceneRow,
} from "./types";

export interface SceneCardView {
  sceneIndex: number;
  /** "Scene 3" */
  title: string;
  status: "success" | "failed";
  imageUrl?: string;
  /** Brand-quality badge label; null when the cost tier is unknown. */
  qualityBadge: "Tube.Flash" | "Tube.Pro" | null;
  /** True when the backup engine contributed (row.isFallback). */
  backupBadge: boolean;
  /** "1.2s" */
  latencyLabel: string;
  errorMessage?: string;
}

export function brandBadge(costTier: OrchestratorSceneRow["costTier"]): SceneCardView["qualityBadge"] {
  if (costTier === "premium") return "Tube.Pro";
  if (costTier === "free") return "Tube.Flash";
  return null;
}

export function latencyLabel(latencyMs: number): string {
  return latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(1)}s` : `${latencyMs}ms`;
}

export function toSceneCardViews(body: OrchestratorStoryboardResponse): SceneCardView[] {
  return body.scenes.map((row) => {
    const view: SceneCardView = {
      sceneIndex: row.sceneIndex,
      title: `Scene ${row.sceneIndex + 1}`,
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

/** Store tier ("free" | "pro" | "enterprise") → engine tier. */
export function toEngineTier(rawTier: string): EngineTier {
  if (rawTier === "pro") return "pro";
  if (rawTier === "enterprise" || rawTier === "cinematic") return "cinematic";
  return "free";
}

export interface SummaryStripView {
  /** "3 of 4 scenes rendered" */
  headline: string;
  /** present when any fallback fired: "1 used the backup engine" */
  fallbackNote: string | null;
}

export function toSummaryStrip(body: OrchestratorStoryboardResponse): SummaryStripView {
  const { total, succeeded, fallbackTriggered } = body.summary;
  return {
    headline: `${succeeded} of ${total} scene${total === 1 ? "" : "s"} rendered`,
    fallbackNote:
      fallbackTriggered > 0
        ? `${fallbackTriggered} used the backup engine`
        : null,
  };
}
