/**
 * Phase G1 — Orchestrator API wire types.
 *
 * Client-side mirrors of the Phase F3 response bodies. The client never
 * renders raw infrastructure fields (Gate 4 contract — user-facing copy
 * shows brand tiers only); `provider` is typed but intentionally never
 * read by views.
 */

export type EngineTier = "free" | "pro" | "cinematic";
export type EngineSceneStatus = "success" | "failed";
export type EngineCostTier = "free" | "premium";

export interface OrchestratorSceneRow {
  sceneIndex: number;
  status: EngineSceneStatus;
  imageUrl?: string;
  /** Never rendered — infrastructure detail (see module doc). */
  provider?: string;
  costTier?: EngineCostTier;
  isFallback: boolean;
  attempts: number;
  latencyMs: number;
  error?: string;
}

export interface OrchestratorSummary {
  total: number;
  succeeded: number;
  failed: number;
  fallbackTriggered: number;
  premiumScenes: number;
  totalKeyRotations: number;
  avgLatencyMs: number;
}

export interface OrchestratorStoryboardMeta {
  model: string;
  attempts: number;
  complexityOverrides: number;
  llmLatencyMs: number;
}

export interface OrchestratorStoryboardResponse {
  tier: EngineTier;
  /** Scenes the planner proposed (pre-cap). */
  plannedScenes: number;
  /** Scenes actually generated (post-cap). */
  generatedScenes: number;
  truncated: boolean;
  remainingScenes: number;
  characterProfile: unknown;
  scenes: OrchestratorSceneRow[];
  summary: OrchestratorSummary;
  meta: OrchestratorStoryboardMeta;
}

export interface OrchestratorThumbnailsResponse {
  tier: EngineTier;
  count: number;
  thumbnails: OrchestratorSceneRow[];
  summary: OrchestratorSummary;
}

export interface TierCatalogEntry {
  tier: EngineTier;
  maxScenes: number | null;
  unlimitedScenes: boolean;
  thumbnailOptions: number[];
}

export interface OrchestratorTiersResponse {
  tiers: TierCatalogEntry[];
}

export interface OrchestratorErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export const ORCHESTRATOR_ERROR_CODES = [
  "invalid_request",
  "thumbnail_count_not_allowed",
  "planner_unavailable",
  "rate_limit_exceeded",
  "internal_error",
] as const;
export type OrchestratorErrorCode = (typeof ORCHESTRATOR_ERROR_CODES)[number];
