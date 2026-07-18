/**
 * Phase H2 — Health report: a human/scheduler-friendly status rollup.
 *
 * Provider states combine D4 breaker truth (open → down, half-open →
 * degraded) with adapter availability (no keys / disabled → down, and
 * the breaker is not blamed for that — it never saw traffic).
 *
 * Rollup (test-locked):
 *   "down"     every provider is down
 *   "degraded" at least one provider is not "up"
 *   "ok"       everything up
 */
import type { GeneratorMetrics } from "../generator/index.js";
import type { ImageProvider } from "../providers/index.js";
import type { CircuitBreaker } from "../resilience/index.js";
import type { ProviderId } from "../types/index.js";

export const HEALTH_STATUSES = ["ok", "degraded", "down"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export interface HealthProviderState {
  provider: ProviderId;
  state: "up" | "degraded" | "down";
  /** Why this state: live breaker read, or static configuration. */
  source: "breaker" | "config";
}

export interface HealthReport {
  status: HealthStatus;
  providers: HealthProviderState[];
  breakersOpen: number;
  images: { generated: number; failed: number };
  ts: number;
}

export interface HealthDeps {
  breaker: CircuitBreaker;
  metrics: GeneratorMetrics;
  providers: ReadonlyArray<ImageProvider>;
  now?: () => number;
}

export function healthReport(deps: HealthDeps): HealthReport {
  const providers: HealthProviderState[] = deps.providers.map((provider) => {
    const breakerState = deps.breaker.state(provider.id);
    if (breakerState === "open") {
      return { provider: provider.id, state: "down", source: "breaker" };
    }
    if (breakerState === "half-open") {
      return { provider: provider.id, state: "degraded", source: "breaker" };
    }
    if (!provider.isAvailable()) {
      return { provider: provider.id, state: "down", source: "config" };
    }
    return { provider: provider.id, state: "up", source: "config" };
  });

  const downCount = providers.filter((p) => p.state === "down").length;
  const status: HealthStatus =
    providers.length > 0 && downCount === providers.length
      ? "down"
      : providers.some((p) => p.state !== "up")
        ? "degraded"
        : "ok";

  const gen = deps.metrics.snapshot();
  return {
    status,
    providers,
    breakersOpen: deps.breaker.snapshot().filter((entry) => entry.state === "open").length,
    images: { generated: gen.imagesGenerated, failed: gen.imagesFailed },
    ts: (deps.now ?? Date.now)(),
  };
}
