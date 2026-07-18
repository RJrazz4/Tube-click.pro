/**
 * Phase E4 — Generator metrics: the Master Plan's named counters.
 *
 * Consumes raw GenerationResults (via record(), or as an E3 OutcomeSink
 * via recordOutcome()) and produces a JSON-serializable snapshot — the
 * direct feedstock for H2's /metrics endpoint and F's dashboards:
 *
 *   images_generated       successful scenes
 *   images_failed          failed scenes (scenesProcessed - generated)
 *   fallback_triggered     scenes where any fallback fired
 *   key_rotations          pool rotations consumed across cascades
 *   cost_estimate          estimatedPremiumUnits — 1 per premium image,
 *                          0 per free; an honest unit proxy, never a
 *                          fabricated dollar figure
 *
 * Memory contract (10k mandate): counters and running sums are exact
 * forever; latency percentiles come from a bounded ring reservoir
 * (default 512 samples), so they are approximate after wrap — count,
 * avg, and max stay exact regardless. Snapshot cost is
 * O(reservoir log reservoir), never O(history).
 */
import type { GenerationResult, ProviderId } from "../types/index.js";

/** Latency samples retained for percentile math. */
export const DEFAULT_LATENCY_RESERVOIR = 512;

export interface GeneratorMetricsOptions {
  /** Ring capacity for latency samples; default 512. */
  latencyReservoir?: number;
}

export interface LatencySnapshot {
  /** Exact: every result ever recorded. */
  count: number;
  /** Exact running mean over ALL results (rounded ms). */
  avgMs: number;
  /** Exact running maximum. */
  maxMs: number;
  /** Approximate (reservoir): nearest-rank percentiles. */
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface GeneratorMetricsSnapshot {
  /** Every scene result recorded, success or failure. */
  scenesProcessed: number;
  imagesGenerated: number;
  imagesFailed: number;
  fallbackTriggered: number;
  keyRotations: number;
  /** The plan's cost_estimate in premium units. */
  estimatedPremiumUnits: number;
  /** Successful generations per provider (failures attributed nowhere). */
  imagesByProvider: Partial<Record<ProviderId, number>>;
  latency: LatencySnapshot;
}

/** Nearest-rank percentile over a pre-sorted sample array. */
function percentile(sortedSamples: readonly number[], p: number): number {
  if (sortedSamples.length === 0) return 0;
  const rank = Math.min(
    sortedSamples.length - 1,
    Math.max(0, Math.ceil(p * sortedSamples.length) - 1),
  );
  return sortedSamples[rank];
}

export class GeneratorMetrics {
  private readonly reservoir: number;

  private scenesProcessed = 0;
  private imagesGenerated = 0;
  private fallbackTriggered = 0;
  private keyRotations = 0;
  private estimatedPremiumUnits = 0;
  private readonly byProvider = new Map<ProviderId, number>();

  private latencySum = 0;
  private latencyMax = 0;
  private samples: number[] = [];
  private head = 0;

  constructor(options: GeneratorMetricsOptions = {}) {
    this.reservoir = Math.max(1, Math.floor(options.latencyReservoir ?? DEFAULT_LATENCY_RESERVOIR));
  }

  /** Feed one scene result. Never throws, never rejects. */
  record(result: GenerationResult): void {
    this.scenesProcessed += 1;
    if (result.status === "success") {
      this.imagesGenerated += 1;
      if (result.costTier === "premium") this.estimatedPremiumUnits += 1;
      if (result.provider !== undefined) {
        this.byProvider.set(result.provider, (this.byProvider.get(result.provider) ?? 0) + 1);
      }
    }
    if (result.isFallback) this.fallbackTriggered += 1;
    this.keyRotations += result.keyRotations;

    this.latencySum += result.latencyMs;
    this.latencyMax = Math.max(this.latencyMax, result.latencyMs);
    if (this.samples.length < this.reservoir) {
      this.samples.push(result.latencyMs);
    } else {
      this.samples[this.head] = result.latencyMs;
      this.head = (this.head + 1) % this.reservoir;
    }
  }

  /** E3 OutcomeSink compatibility — plugs straight into aggregateStoryboard. */
  recordOutcome(result: GenerationResult): void {
    this.record(result);
  }

  /** Point-in-time, JSON-serializable snapshot for H2's /metrics. */
  snapshot(): GeneratorMetricsSnapshot {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const imagesByProvider: Partial<Record<ProviderId, number>> = {};
    for (const [provider, count] of [...this.byProvider.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      imagesByProvider[provider] = count;
    }

    return {
      scenesProcessed: this.scenesProcessed,
      imagesGenerated: this.imagesGenerated,
      imagesFailed: this.scenesProcessed - this.imagesGenerated,
      fallbackTriggered: this.fallbackTriggered,
      keyRotations: this.keyRotations,
      estimatedPremiumUnits: this.estimatedPremiumUnits,
      imagesByProvider,
      latency: {
        count: this.scenesProcessed,
        avgMs: this.scenesProcessed === 0 ? 0 : Math.round(this.latencySum / this.scenesProcessed),
        maxMs: this.latencyMax,
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        p99Ms: percentile(sorted, 0.99),
      },
    };
  }

  /** Ops escape hatch: zero everything. */
  reset(): void {
    this.scenesProcessed = 0;
    this.imagesGenerated = 0;
    this.fallbackTriggered = 0;
    this.keyRotations = 0;
    this.estimatedPremiumUnits = 0;
    this.byProvider.clear();
    this.latencySum = 0;
    this.latencyMax = 0;
    this.samples = [];
    this.head = 0;
  }
}
