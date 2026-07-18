import { describe, expect, it } from "vitest";

import { CostTracker } from "../cost/index.js";
import type { GenerationResult } from "../types/index.js";

import {
  DEFAULT_LATENCY_RESERVOIR,
  GeneratorMetrics,
} from "./generator-metrics.js";
import { aggregateStoryboard } from "./storyboard.js";

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

describe("GeneratorMetrics — the plan's named counters", () => {
  it("starts at zero", () => {
    expect(new GeneratorMetrics().snapshot()).toEqual({
      scenesProcessed: 0,
      imagesGenerated: 0,
      imagesFailed: 0,
      fallbackTriggered: 0,
      keyRotations: 0,
      estimatedPremiumUnits: 0,
      imagesByProvider: {},
      latency: { count: 0, avgMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
    });
  });

  it("counts images, failures, fallbacks, rotations, and premium units exactly", () => {
    const metrics = new GeneratorMetrics();
    metrics.record(result({ provider: "agnes", costTier: "premium" }));
    metrics.record(result({ provider: "hf", costTier: "free", isFallback: true, attempts: 2, keyRotations: 2 }));
    metrics.record(result({ provider: "hf", costTier: "free", keyRotations: 1 }));
    metrics.record(result({ status: "failed", provider: "gemini", costTier: "premium", isFallback: true }));

    const snapshot = metrics.snapshot();
    expect(snapshot).toMatchObject({
      scenesProcessed: 4,
      imagesGenerated: 3,
      imagesFailed: 1,
      fallbackTriggered: 2,
      keyRotations: 3,
      // The failed premium scene burned no image: cost_estimate counts
      // generated premium units only.
      estimatedPremiumUnits: 1,
    });
    // Failures are attributed nowhere; successes tallied per provider.
    expect(snapshot.imagesByProvider).toEqual({ agnes: 1, hf: 2 });
  });

  it("snapshot is JSON-serializable (H2 /metrics payload shape)", () => {
    const metrics = new GeneratorMetrics();
    metrics.record(result({ provider: "hf", costTier: "free" }));
    const roundTripped = JSON.parse(JSON.stringify(metrics.snapshot()));
    expect(roundTripped.imagesByProvider).toEqual({ hf: 1 });
    expect(roundTripped.imagesGenerated).toBe(1);
  });

  it("reset() zeroes every counter and sample", () => {
    const metrics = new GeneratorMetrics();
    metrics.record(result({ provider: "hf", costTier: "free", latencyMs: 500 }));
    metrics.reset();
    expect(metrics.snapshot()).toEqual(new GeneratorMetrics().snapshot());
  });
});

describe("GeneratorMetrics — latency statistics", () => {
  it("computes exact avg/max and nearest-rank percentiles over 1..100ms", () => {
    const metrics = new GeneratorMetrics();
    for (let ms = 1; ms <= 100; ms += 1) {
      metrics.record(result({ latencyMs: ms }));
    }

    expect(metrics.snapshot().latency).toEqual({
      count: 100,
      avgMs: 51, // Math.round(50.5)
      maxMs: 100,
      p50Ms: 50,
      p95Ms: 95,
      p99Ms: 99,
    });
  });

  it("bounds its reservoir: percentiles approximate after wrap, counters stay exact", () => {
    const metrics = new GeneratorMetrics({ latencyReservoir: 10 });
    for (let ms = 1; ms <= 50; ms += 1) {
      metrics.record(result({ latencyMs: ms }));
    }

    const latency = metrics.snapshot().latency;
    // Exact regardless of reservoir:
    expect(latency.count).toBe(50);
    expect(latency.avgMs).toBe(26); // Math.round(25.5)
    expect(latency.maxMs).toBe(50);
    // Approximate: only the last 10 samples (41..50) survived the ring.
    expect(latency.p50Ms).toBe(45);
    expect(latency.p95Ms).toBe(50);
  });

  it("sane default reservoir size", () => {
    expect(DEFAULT_LATENCY_RESERVOIR).toBe(512);
  });
});

describe("E3 × E4 — metrics as an outcome sink beside the C4 tracker", () => {
  it("one aggregateStoryboard call feeds CostTracker AND GeneratorMetrics", () => {
    const tracker = new CostTracker();
    const metrics = new GeneratorMetrics();
    const results = [
      result({ sceneIndex: 0, provider: "agnes", costTier: "premium", latencyMs: 300 }),
      result({ sceneIndex: 1, provider: "pollinations", costTier: "free", isFallback: true, attempts: 2, latencyMs: 100, keyRotations: 1 }),
      result({ sceneIndex: 2, status: "failed", latencyMs: 50 }),
    ];

    const storyboard = aggregateStoryboard(results, { outcomes: [tracker, metrics] });

    // E3 assembly unaffected:
    expect(storyboard.summary).toMatchObject({ total: 3, succeeded: 2, fallbackTriggered: 1 });
    // E4 counters match the same truth:
    expect(metrics.snapshot()).toMatchObject({
      scenesProcessed: 3,
      imagesGenerated: 2,
      imagesFailed: 1,
      fallbackTriggered: 1,
      keyRotations: 1,
      estimatedPremiumUnits: 1,
    });
    expect(metrics.snapshot().latency).toMatchObject({ avgMs: 150, maxMs: 300, p50Ms: 100 });
    // C4 ledger saw them too:
    expect(tracker.summary().outcomes).toMatchObject({ recorded: 3, succeeded: 2, fallbacks: 1 });
  });

  it("the full pipeline: E1 batch → E3 aggregate → E4 snapshot", async () => {
    // Downstream of E1×E2 (integration-tested there), results arrive here:
    const results: GenerationResult[] = Array.from({ length: 8 }, (_, i) =>
      result({ sceneIndex: i, provider: "hf", costTier: "free", latencyMs: 10 * (i + 1) }),
    );
    const metrics = new GeneratorMetrics();

    const storyboard = aggregateStoryboard(results, { outcomes: metrics });

    expect(storyboard.scenes.map((s) => s.sceneIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(metrics.snapshot()).toMatchObject({
      scenesProcessed: 8,
      imagesGenerated: 8,
      imagesFailed: 0,
      fallbackTriggered: 0,
      estimatedPremiumUnits: 0,
    });
    expect(metrics.snapshot().imagesByProvider).toEqual({ hf: 8 });
    expect(metrics.snapshot().latency).toMatchObject({ count: 8, maxMs: 80 });
  });
});
