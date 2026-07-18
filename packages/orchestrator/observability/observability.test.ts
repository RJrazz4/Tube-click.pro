import { describe, expect, it } from "vitest";

import { TierRateLimiter } from "../api/rate-limiter.js";
import { CostTracker } from "../cost/index.js";
import { GeneratorMetrics } from "../generator/index.js";
import type { ImageProvider, ProviderHealthReport } from "../providers/index.js";
import { CircuitBreaker } from "../resilience/index.js";
import type { GenerationResult, ProviderId } from "../types/index.js";

import { healthReport } from "./health.js";
import { prometheusText } from "./prometheus.js";
import { observabilitySnapshot } from "./snapshot.js";

function result(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    sceneIndex: 0,
    status: "success",
    isFallback: false,
    attempts: 1,
    keyRotations: 0,
    latencyMs: 100,
    ...overrides,
  };
}

function fixture() {
  const breaker = new CircuitBreaker({ failureThreshold: 1 });
  const tracker = new CostTracker();
  const metrics = new GeneratorMetrics();

  tracker.record({
    sceneIndex: 0,
    complexity: "SIMPLE",
    providerId: "hf",
    providerTier: "free",
    reason: "complexity-match",
    fallbacks: ["pollinations"],
    decidedAt: 1,
  });
  metrics.record(result({ provider: "hf", costTier: "free", latencyMs: 100, keyRotations: 1 }));
  metrics.record(result({ provider: "agnes", costTier: "premium", isFallback: true, latencyMs: 300 }));
  breaker.recordFailure("hf");

  return { breaker, tracker, metrics };
}

describe("observabilitySnapshot", () => {
  it("assembles tracker + breaker + metrics into one JSON document", () => {
    const { breaker, tracker, metrics } = fixture();
    const snapshot = observabilitySnapshot({
      breaker,
      tracker,
      metrics,
      rateLimiter: new TierRateLimiter(),
      now: () => 7,
    });

    expect(snapshot.ts).toBe(7);
    expect(snapshot.generator).toMatchObject({
      scenesProcessed: 2,
      imagesGenerated: 2,
      fallbackTriggered: 1,
      keyRotations: 1,
      estimatedPremiumUnits: 1,
    });
    expect(snapshot.routing.total).toBe(1);
    expect(snapshot.breakers[0]).toMatchObject({ provider: "hf", state: "open", totalTrips: 1 });
    expect(snapshot.rateLimiter).toMatchObject({ buckets: 0 });
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it("omits the limiter section when none is mounted", () => {
    const { breaker, tracker, metrics } = fixture();
    const snapshot = observabilitySnapshot({ breaker, tracker, metrics });
    expect(snapshot.rateLimiter).toBeUndefined();
  });
});

describe("prometheusText", () => {
  it("emits counters, gauges, labels, and the breaker state mapping", () => {
    const { breaker, tracker, metrics } = fixture();
    const limiter = new TierRateLimiter();
    limiter.check("free", "u1");
    const text = prometheusText(
      observabilitySnapshot({ breaker, tracker, metrics, rateLimiter: limiter, now: () => 0 }),
    );

    const expectedLines = [
      "tubeclick_images_generated_total 2",
      "tubeclick_fallback_triggered_total 1",
      "tubeclick_key_rotations_total 1",
      "tubeclick_estimated_premium_units_total 1",
      'tubeclick_provider_images_total{provider="agnes"} 1',
      'tubeclick_provider_images_total{provider="hf"} 1',
      'tubeclick_breaker_state{provider="hf"} 2', // open
      'tubeclick_breaker_trips_total{provider="hf"} 1',
      'tubeclick_routing_reason_total{reason="complexity-match"} 1',
      "tubeclick_routing_free_total 1",
      "tubeclick_rate_limiter_buckets 1",
      'tubeclick_rate_limiter_capacity{tier="cinematic"} 300',
      'tubeclick_latency_ms{quantile="0.95"} 300',
    ];
    for (const line of expectedLines) {
      expect(text).toContain(line);
    }
    expect(text).toMatch(/# TYPE tubeclick_images_generated_total counter/);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("label lines always follow the single-label enum form", () => {
    const { breaker, tracker, metrics } = fixture();
    const text = prometheusText(observabilitySnapshot({ breaker, tracker, metrics }));
    const labelLines = text.split("\n").filter((line) => line.includes("{"));
    expect(labelLines.length).toBeGreaterThan(0);
    for (const line of labelLines) {
      // metric{label="enum-value"} number — nothing else, ever:
      expect(line).toMatch(/^tubeclick_[a-z_]+\{[a-z_]+="[a-z0-9.\-_]+"\} \d+$/);
    }
    // No request/user-controlled fields (scripts, prompts, image URLs):
    expect(text).not.toContain("prompt");
    expect(text).not.toContain("http");
  });
});

describe("healthReport", () => {
  const stubProvider = (id: ProviderId, available = true): ImageProvider => ({
    id,
    tier: id === "pollinations" ? "free" : "premium",
    keyless: id === "pollinations",
    isAvailable: () => available,
    generate: () => Promise.reject(new Error("not used in health tests")),
    healthCheck: async (): Promise<ProviderHealthReport> => ({
      provider: id,
      state: "up",
      latencyMs: 1,
      checkedAt: 0,
    }),
  });

  it("ok when every provider is up and no breaker is open", () => {
    const report = healthReport({
      breaker: new CircuitBreaker(),
      metrics: new GeneratorMetrics(),
      providers: [stubProvider("agnes"), stubProvider("pollinations")],
      now: () => 9,
    });
    expect(report.status).toBe("ok");
    expect(report.breakersOpen).toBe(0);
    expect(report.providers.map((p) => p.state)).toEqual(["up", "up"]);
    expect(report.ts).toBe(9);
  });

  it("degraded when a breaker is open (source: breaker) or a provider is unconfigured (source: config)", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure("gemini");
    const report = healthReport({
      breaker,
      metrics: new GeneratorMetrics(),
      providers: [stubProvider("gemini"), stubProvider("hf", false), stubProvider("pollinations")],
    });
    expect(report.status).toBe("degraded");
    expect(report.providers.find((p) => p.provider === "gemini")).toMatchObject({ state: "down", source: "breaker" });
    expect(report.providers.find((p) => p.provider === "hf")).toMatchObject({ state: "down", source: "config" });
    expect(report.breakersOpen).toBe(1);
  });

  it("down only when EVERY provider is down", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure("agnes");
    const report = healthReport({
      breaker,
      metrics: new GeneratorMetrics(),
      providers: [stubProvider("agnes"), stubProvider("hf", false)],
    });
    expect(report.status).toBe("down");
  });

  it("reports generation counters alongside status", () => {
    const metrics = new GeneratorMetrics();
    metrics.record(result({}));
    metrics.record(result({ status: "failed" }));
    const report = healthReport({
      breaker: new CircuitBreaker(),
      metrics,
      providers: [stubProvider("pollinations")],
    });
    expect(report.images).toEqual({ generated: 1, failed: 1 });
  });
});
