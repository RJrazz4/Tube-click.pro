/**
 * Phase H2 — Prometheus text exposition of the observability snapshot.
 *
 * Counter/gauge exposition (v0.0.4 format). Label values only ever come
 * from internal enums (providers, tiers, routing reasons), so no label
 * escaping is required — that invariant is test-locked.
 *
 * breaker_state_gauge semantics: 0 = closed, 1 = half-open, 2 = open.
 */
import type { BreakerSnapshotEntry } from "../resilience/index.js";

import type { ObservabilitySnapshot } from "./snapshot.js";

const BREAKER_STATE_GAUGE: Record<BreakerSnapshotEntry["state"], number> = {
  closed: 0,
  "half-open": 1,
  open: 2,
};

export function prometheusText(snapshot: ObservabilitySnapshot): string {
  const lines: string[] = [];
  const counter = (name: string, help: string, value: number): void => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} counter`);
    lines.push(`${name} ${value}`);
  };
  const gauge = (name: string, help: string, value: number): void => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${value}`);
  };

  const g = snapshot.generator;
  counter("tubeclick_scenes_processed_total", "Scene results recorded.", g.scenesProcessed);
  counter("tubeclick_images_generated_total", "Successful scene generations.", g.imagesGenerated);
  counter("tubeclick_images_failed_total", "Failed scene generations.", g.imagesFailed);
  counter("tubeclick_fallback_triggered_total", "Scenes where any fallback fired.", g.fallbackTriggered);
  counter("tubeclick_key_rotations_total", "Pool key rotations consumed.", g.keyRotations);
  counter(
    "tubeclick_estimated_premium_units_total",
    "Premium units consumed (1 per premium image) — the cost estimate.",
    g.estimatedPremiumUnits,
  );

  gauge("tubeclick_latency_ms_avg", "Mean generation latency (all results).", g.latency.avgMs);
  gauge("tubeclick_latency_ms_max", "Max generation latency (reservoir window).", g.latency.maxMs);
  lines.push("# HELP tubeclick_latency_ms Generation latency percentiles (reservoir window).");
  lines.push("# TYPE tubeclick_latency_ms gauge");
  lines.push(`tubeclick_latency_ms{quantile="0.5"} ${g.latency.p50Ms}`);
  lines.push(`tubeclick_latency_ms{quantile="0.95"} ${g.latency.p95Ms}`);
  lines.push(`tubeclick_latency_ms{quantile="0.99"} ${g.latency.p99Ms}`);

  lines.push("# HELP tubeclick_provider_images_total Successful generations per provider.");
  lines.push("# TYPE tubeclick_provider_images_total counter");
  for (const [provider, count] of Object.entries(g.imagesByProvider)) {
    lines.push(`tubeclick_provider_images_total{provider="${provider}"} ${count}`);
  }

  lines.push("# HELP tubeclick_breaker_state Breaker state per provider (0=closed, 1=half-open, 2=open).");
  lines.push("# TYPE tubeclick_breaker_state gauge");
  lines.push("# HELP tubeclick_breaker_trips_total Times a breaker opened.");
  lines.push("# TYPE tubeclick_breaker_trips_total counter");
  for (const breaker of snapshot.breakers) {
    lines.push(
      `tubeclick_breaker_state{provider="${breaker.provider}"} ${BREAKER_STATE_GAUGE[breaker.state]}`,
      `tubeclick_breaker_trips_total{provider="${breaker.provider}"} ${breaker.totalTrips}`,
    );
  }

  counter("tubeclick_routing_decisions_total", "Routing decisions recorded.", snapshot.routing.total);
  counter("tubeclick_routing_premium_total", "Decisions routed to premium providers.", snapshot.routing.premiumRouted);
  counter("tubeclick_routing_free_total", "Decisions routed to free providers.", snapshot.routing.freeRouted);
  lines.push("# HELP tubeclick_routing_reason_total Decisions per routing reason.");
  lines.push("# TYPE tubeclick_routing_reason_total counter");
  for (const [reason, count] of Object.entries(snapshot.routing.byReason)) {
    lines.push(`tubeclick_routing_reason_total{reason="${reason}"} ${count}`);
  }

  if (snapshot.rateLimiter !== undefined) {
    gauge("tubeclick_rate_limiter_buckets", "Rate-limit identities tracked.", snapshot.rateLimiter.buckets);
    lines.push("# HELP tubeclick_rate_limiter_capacity Bucket capacity per tier rule.");
    lines.push("# TYPE tubeclick_rate_limiter_capacity gauge");
    for (const [tier, rule] of Object.entries(snapshot.rateLimiter.rules)) {
      lines.push(`tubeclick_rate_limiter_capacity{tier="${tier}"} ${rule.capacity}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
