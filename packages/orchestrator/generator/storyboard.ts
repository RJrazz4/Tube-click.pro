/**
 * Phase E3 — Storyboard aggregation: scene results → ordered storyboard.
 *
 * E1/E2 produce one GenerationResult per scene. E3 is the assembly step
 * the Master Plan names: re-sort by sceneIndex and present the per-scene
 * metadata triple (provider, isFallback, costTier) that the UI (G) badges
 * and the business layer (F2) consume — plus a storyboard-level summary
 * for E4 metrics and F's response shaping.
 *
 * The aggregator never throws and never fabricates scenes: it organizes
 * exactly what E2 delivered — failed scenes stay failed, errors stay
 * sanitized, input arrays are not mutated. Outcome sinks (C4's
 * CostTracker, E4's GeneratorMetrics) are fed every raw result; a
 * misbehaving sink can never break storyboard assembly.
 */
import type {
  GenerationResult,
  GenerationStatus,
  ProviderId,
  ProviderTier,
} from "../types/index.js";

/** One storyboard row: the plan's E3 triple plus UI badge metadata. */
export interface StoryboardScene {
  sceneIndex: number;
  status: GenerationStatus;
  imageUrl?: string;
  provider?: ProviderId;
  costTier?: ProviderTier;
  isFallback: boolean;
  attempts: number;
  latencyMs: number;
  error?: string;
}

export interface StoryboardSummary {
  total: number;
  succeeded: number;
  failed: number;
  /** Scenes where any fallback fired (plan's fallback_triggered feed). */
  fallbackTriggered: number;
  /** Scenes actually produced by a premium provider (margin watch). */
  premiumScenes: number;
  totalKeyRotations: number;
  avgLatencyMs: number;
}

export interface Storyboard {
  /** Sorted by sceneIndex ascending, always. */
  scenes: StoryboardScene[];
  summary: StoryboardSummary;
}

/** Anything that consumes raw GenerationResults — C4 and E4 both satisfy it. */
export interface OutcomeSink {
  recordOutcome(result: GenerationResult): void;
}

export interface AggregateStoryboardOptions {
  /** One sink or several; receives every raw result (pre-sort). */
  outcomes?: OutcomeSink | ReadonlyArray<OutcomeSink>;
}

export function aggregateStoryboard(
  results: readonly GenerationResult[],
  options: AggregateStoryboardOptions = {},
): Storyboard {
  const sinks: ReadonlyArray<OutcomeSink> =
    options.outcomes === undefined
      ? []
      : Array.isArray(options.outcomes)
        ? options.outcomes
        : [options.outcomes];

  // Feed sinks first — every raw result, exactly once. A broken sink must
  // never break storyboard assembly.
  for (const result of results) {
    for (const sink of sinks) {
      try {
        sink.recordOutcome(result);
      } catch {
        // metrics must never take down user flow
      }
    }
  }

  const sorted = [...results].sort((a, b) => a.sceneIndex - b.sceneIndex);

  const scenes: StoryboardScene[] = [];
  let succeeded = 0;
  let fallbackTriggered = 0;
  let premiumScenes = 0;
  let totalKeyRotations = 0;
  let totalLatency = 0;

  for (const result of sorted) {
    const scene: StoryboardScene = {
      sceneIndex: result.sceneIndex,
      status: result.status,
      isFallback: result.isFallback,
      attempts: result.attempts,
      latencyMs: result.latencyMs,
    };
    if (result.imageUrl !== undefined) scene.imageUrl = result.imageUrl;
    if (result.provider !== undefined) scene.provider = result.provider;
    if (result.costTier !== undefined) scene.costTier = result.costTier;
    if (result.error !== undefined) scene.error = result.error;
    scenes.push(scene);

    if (result.status === "success") succeeded += 1;
    if (result.isFallback) fallbackTriggered += 1;
    if (result.status === "success" && result.costTier === "premium") premiumScenes += 1;
    totalKeyRotations += result.keyRotations;
    totalLatency += result.latencyMs;
  }

  const total = sorted.length;
  return {
    scenes,
    summary: {
      total,
      succeeded,
      failed: total - succeeded,
      fallbackTriggered,
      premiumScenes,
      totalKeyRotations,
      avgLatencyMs: total === 0 ? 0 : Math.round(totalLatency / total),
    },
  };
}
