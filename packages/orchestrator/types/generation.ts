/**
 * Phase A3 — GenerationResult: E2/E3's per-scene output record.
 *
 * One result per scene, always — success carries imageUrl, failure carries
 * a sanitized error (never key material). E3 aggregates results sorted by
 * sceneIndex with this exact metadata attached:
 * (provider, isFallback, costTier) per the Master Plan.
 */
import type { ProviderId, ProviderTier } from "./provider.js";

export const GENERATION_STATUSES = ["success", "failed"] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export interface GenerationResult {
  sceneIndex: number;
  status: GenerationStatus;
  /** Present when status is "success". */
  imageUrl?: string;
  /** Provider that actually produced/failed last (undefined = never attempted). */
  provider?: ProviderId;
  /** Cost class of that provider — the plan's `costTier` metadata. */
  costTier?: ProviderTier;
  /** True when any fallback fired (primary did not succeed). */
  isFallback: boolean;
  /** Total provider attempts made for this scene (>= 1). */
  attempts: number;
  /** E4 metric: how many key rotations occurred across attempts. */
  keyRotations: number;
  /** End-to-end wall time for this scene's pipeline in ms. */
  latencyMs: number;
  /** Sanitized failure summary when status is "failed" — no key material. */
  error?: string;
}
