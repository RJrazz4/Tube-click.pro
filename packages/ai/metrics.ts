/**
 * Phase 6 — Metrics Collector
 *
 * Lightweight in-memory metrics for tracking generation performance.
 * Counters, histograms, and provider-level breakdowns are accumulated
 * per cold-start and exposed via the /api/v1/metrics endpoint.
 *
 * Suitable for:
 *   - Dashboards (Vercel Analytics, Grafana, Axiom)
 *   - Alerts (high fallback rate, low success rate)
 *   - Cost tracking (provider usage breakdown)
 *
 * Reset on every cold start (Vercel Edge redeploy). For persistent
 * metrics, export to an external service via webhook.
 */

export type MetricEvent =
  | "generation.started"
  | "generation.completed"
  | "generation.failed"
  | "provider.rotated"
  | "provider.exhausted"
  | "fallback.used"
  | "tier.limit.enforced"
  | "api.request"
  | "api.error"
  | "latency.histogram";

export interface MetricCounter {
  count: number;
  lastSeen: number; // epoch ms
}

export interface MetricHistogram {
  count: number;
  sum: number;
  min: number;
  max: number;
}

export interface ProviderMetrics {
  /** Number of successful generations. */
  success: number;
  /** Number of failed attempts (includes retries). */
  failures: number;
  /** Number of key rotations performed. */
  keyRotations: number;
  /** Accumulated latency in ms. */
  totalLatencyMs: number;
  /** Generation count per model variant. */
  byModel: Record<string, number>;
}

export interface MetricsSnapshot {
  /** Time of the snapshot (epoch ms). */
  timestamp: number;
  /** Wall-clock uptime in ms since the metrics collector was created. */
  uptimeMs: number;
  /** Global counters. */
  counters: Record<string, MetricCounter>;
  /** Latency histogram buckets (ms). */
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
  /** Provider breakdown. */
  providers: Record<string, ProviderMetrics>;
  /** Total generations attempted. */
  totalGenerations: number;
  /** Successful generations. */
  successfulGenerations: number;
  /** Failed generations. */
  failedGenerations: number;
  /** Number of times the fallback (Pollinations) was used. */
  fallbackCount: number;
  /** Overall fallback rate (0-1). */
  fallbackRate: number;
}

class MetricsCollector {
  private readonly startTime = Date.now();
  private counters = new Map<string, MetricCounter>();
  private latencies: number[] = [];
  private providerMetrics = new Map<string, ProviderMetrics>();

  /** Increment a named counter. */
  increment(event: MetricEvent | string, by = 1): void {
    const existing = this.counters.get(event) || { count: 0, lastSeen: 0 };
    existing.count += by;
    existing.lastSeen = Date.now();
    this.counters.set(event, existing);
  }

  /** Record a generation latency in ms. */
  recordLatency(ms: number): void {
    this.latencies.push(ms);
    // Cap the array to prevent unbounded memory growth (~100k samples = ~800KB)
    if (this.latencies.length > 100_000) {
      this.latencies.shift();
    }
  }

  /** Record a provider generation outcome. */
  recordProvider(
    provider: string,
    outcome: "success" | "failure",
    latencyMs: number,
    model?: string
  ): void {
    const existing = this.providerMetrics.get(provider) || {
      success: 0,
      failures: 0,
      keyRotations: 0,
      totalLatencyMs: 0,
      byModel: {},
    };

    if (outcome === "success") existing.success++;
    else existing.failures++;

    existing.totalLatencyMs += latencyMs;

    if (model) {
      existing.byModel[model] = (existing.byModel[model] || 0) + 1;
    }

    this.providerMetrics.set(provider, existing);
    this.recordLatency(latencyMs);
  }

  /** Record a key rotation (without provider outcome). */
  recordKeyRotation(provider: string): void {
    const existing = this.providerMetrics.get(provider) || {
      success: 0,
      failures: 0,
      keyRotations: 0,
      totalLatencyMs: 0,
      byModel: {},
    };
    existing.keyRotations++;
    this.providerMetrics.set(provider, existing);
  }

  /** Compute latency percentiles from sorted array. */
  private percentiles(): { p50: number; p95: number; p99: number } {
    if (this.latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const len = sorted.length;
    return {
      p50: sorted[Math.floor(len * 0.5)] || 0,
      p95: sorted[Math.floor(len * 0.95)] || 0,
      p99: sorted[Math.floor(len * 0.99)] || 0,
    };
  }

  /** Take a snapshot of all metrics. */
  snapshot(): MetricsSnapshot {
    const totalGenerations = this.counters.get("generation.started")?.count || 0;
    const successfulGenerations =
      this.counters.get("generation.completed")?.count || 0;
    const failedGenerations =
      this.counters.get("generation.failed")?.count || 0;
    const fallbackCount = this.counters.get("fallback.used")?.count || 0;

    const providerEntries: Record<string, ProviderMetrics> = {};
    for (const [name, metrics] of this.providerMetrics) {
      providerEntries[name] = metrics;
    }

    const counterEntries: Record<string, MetricCounter> = {};
    for (const [name, counter] of this.counters) {
      counterEntries[name] = counter;
    }

    return {
      timestamp: Date.now(),
      uptimeMs: Date.now() - this.startTime,
      counters: counterEntries,
      latency: this.percentiles(),
      providers: providerEntries,
      totalGenerations,
      successfulGenerations,
      failedGenerations,
      fallbackCount,
      fallbackRate: totalGenerations > 0 ? fallbackCount / totalGenerations : 0,
    };
  }

  /** Reset all metrics (useful for tests or admin endpoint). */
  reset(): void {
    this.counters.clear();
    this.latencies = [];
    this.providerMetrics.clear();
  }
}

/** Singleton metrics collector instance. */
export const metrics = new MetricsCollector();

export default metrics;
