import { describe, expect, it } from "vitest";

import { CostTracker } from "../cost/index.js";
import type { GenerationResult } from "../types/index.js";

import { aggregateStoryboard, type OutcomeSink } from "./storyboard.js";

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

describe("aggregateStoryboard — ordering and metadata", () => {
  it("re-sorts by sceneIndex without mutating the input array", () => {
    const input = [
      result({ sceneIndex: 2 }),
      result({ sceneIndex: 0 }),
      result({ sceneIndex: 1 }),
    ];

    const storyboard = aggregateStoryboard(input);

    expect(storyboard.scenes.map((s) => s.sceneIndex)).toEqual([0, 1, 2]);
    // input untouched
    expect(input.map((r) => r.sceneIndex)).toEqual([2, 0, 1]);
  });

  it("preserves the E3 metadata triple (provider, isFallback, costTier) per scene", () => {
    const storyboard = aggregateStoryboard([
      result({
        sceneIndex: 0,
        provider: "agnes",
        costTier: "premium",
        isFallback: true,
        attempts: 3,
        imageUrl: "https://img.test/a.png",
      }),
      result({
        sceneIndex: 1,
        provider: "pollinations",
        costTier: "free",
        imageUrl: "https://img.test/p.png",
      }),
    ]);

    expect(storyboard.scenes[0]).toMatchObject({
      sceneIndex: 0,
      provider: "agnes",
      costTier: "premium",
      isFallback: true,
      attempts: 3,
      imageUrl: "https://img.test/a.png",
    });
    expect(storyboard.scenes[1]).toMatchObject({
      sceneIndex: 1,
      provider: "pollinations",
      costTier: "free",
      isFallback: false,
    });
  });

  it("failed scenes stay failed with their sanitized error intact", () => {
    const storyboard = aggregateStoryboard([
      result({ sceneIndex: 0, status: "failed", error: "scene 0: all providers failed" }),
    ]);

    expect(storyboard.scenes[0]).toMatchObject({
      status: "failed",
      error: "scene 0: all providers failed",
    });
    expect(storyboard.scenes[0]?.imageUrl).toBeUndefined();
    expect(storyboard.summary.failed).toBe(1);
  });
});

describe("aggregateStoryboard — summary statistics", () => {
  it("counts totals, fallbacks, premium scenes, rotations, and latency", () => {
    const storyboard = aggregateStoryboard([
      result({ sceneIndex: 0, costTier: "premium", latencyMs: 300, keyRotations: 1 }),
      result({ sceneIndex: 1, costTier: "free", isFallback: true, attempts: 2, latencyMs: 200 }),
      result({ sceneIndex: 2, status: "failed", latencyMs: 100, keyRotations: 2 }),
    ]);

    expect(storyboard.summary).toEqual({
      total: 3,
      succeeded: 2,
      failed: 1,
      fallbackTriggered: 1,
      premiumScenes: 1,
      totalKeyRotations: 3,
      avgLatencyMs: 200,
    });
  });

  it("empty input yields an empty storyboard with a zeroed summary", () => {
    const storyboard = aggregateStoryboard([]);
    expect(storyboard.scenes).toEqual([]);
    expect(storyboard.summary).toEqual({
      total: 0,
      succeeded: 0,
      failed: 0,
      fallbackTriggered: 0,
      premiumScenes: 0,
      totalKeyRotations: 0,
      avgLatencyMs: 0,
    });
  });

  it("premium count only includes SUCCESSFUL premium scenes", () => {
    const storyboard = aggregateStoryboard([
      result({ sceneIndex: 0, status: "failed", costTier: "premium" }),
    ]);
    expect(storyboard.summary.premiumScenes).toBe(0);
  });
});

describe("aggregateStoryboard — outcome sinks", () => {
  it("feeds a real CostTracker every raw outcome", () => {
    const tracker = new CostTracker();
    const results = [
      result({ sceneIndex: 0, costTier: "premium", keyRotations: 1 }),
      result({ sceneIndex: 1, isFallback: true, attempts: 2 }),
      result({ sceneIndex: 2, status: "failed" }),
    ];

    aggregateStoryboard(results, { outcomes: tracker });

    expect(tracker.outcomes()).toHaveLength(3);
    expect(tracker.summary().outcomes).toMatchObject({
      recorded: 3,
      succeeded: 2,
      failed: 1,
      fallbacks: 1,
      totalKeyRotations: 1,
      estimatedPremiumUnits: 1,
    });
  });

  it("supports multiple sinks at once (the F-phase composition)", () => {
    const tracker = new CostTracker();
    const seen: number[] = [];
    const spy: OutcomeSink = {
      recordOutcome: (r) => {
        seen.push(r.sceneIndex);
      },
    };

    aggregateStoryboard([result({ sceneIndex: 5 }), result({ sceneIndex: 9 })], {
      outcomes: [tracker, spy],
    });

    expect(tracker.outcomes()).toHaveLength(2);
    expect(seen).toEqual([5, 9]);
  });

  it("a throwing sink can never break storyboard assembly", () => {
    const broken: OutcomeSink = {
      recordOutcome: () => {
        throw new Error("metrics backend down");
      },
    };

    const storyboard = aggregateStoryboard([result({ sceneIndex: 0 })], {
      outcomes: broken,
    });

    expect(storyboard.summary.total).toBe(1);
  });
});
