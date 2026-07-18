/**
 * Phase H2 — Observability snapshot: one assembled read of the system.
 *
 * Composes the four owners' snapshots into a single JSON-serializable
 * document:
 *   C4 CostTracker      → routing decisions + outcomes ledgers
 *   D4 CircuitBreaker   → per-provider breaker states/trips
 *   E4 GeneratorMetrics → named counters + latency percentiles
 *   F4 TierRateLimiter  → bucket map size + rules (when mounted)
 *
 * Read-only, never mutates — safe to call per scrape.
 */
import { TierRateLimiter, type RateLimitRule } from "../api/rate-limiter.js";
import type { CostSummary, CostTracker } from "../cost/index.js";
import type { GeneratorMetrics, GeneratorMetricsSnapshot } from "../generator/index.js";
import type { CircuitBreaker, BreakerSnapshotEntry } from "../resilience/index.js";
import type { UserTier } from "../types/index.js";

export interface ObservabilityDeps {
  breaker: CircuitBreaker;
  tracker: CostTracker;
  metrics: GeneratorMetrics;
  rateLimiter?: TierRateLimiter;
  now?: () => number;
}

export interface ObservabilitySnapshot {
  ts: number;
  generator: GeneratorMetricsSnapshot;
  routing: CostSummary["decisions"];
  outcomes: CostSummary["outcomes"];
  breakers: BreakerSnapshotEntry[];
  rateLimiter?: {
    buckets: number;
    rules: Record<UserTier, RateLimitRule>;
  };
}

export function observabilitySnapshot(deps: ObservabilityDeps): ObservabilitySnapshot {
  const summary = deps.tracker.summary();
  const snapshot: ObservabilitySnapshot = {
    ts: (deps.now ?? Date.now)(),
    generator: deps.metrics.snapshot(),
    routing: summary.decisions,
    outcomes: summary.outcomes,
    breakers: deps.breaker.snapshot(),
  };
  if (deps.rateLimiter !== undefined) {
    const limiter = deps.rateLimiter;
    snapshot.rateLimiter = {
      buckets: limiter.bucketCount,
      rules: {
        free: limiter.ruleFor("free"),
        pro: limiter.ruleFor("pro"),
        cinematic: limiter.ruleFor("cinematic"),
      },
    };
  }
  return snapshot;
}
