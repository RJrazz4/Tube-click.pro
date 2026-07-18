import { describe, expect, it } from "vitest";

import type { ScenePlan, UserTier } from "../types/index.js";

import { TierPolicy } from "./tier-policy.js";
import { applySceneCap, truncateForTier } from "./truncate.js";

function scene(index: number): ScenePlan {
  return {
    index,
    title: `Scene ${index}`,
    prompt: `prompt for scene ${index}`,
    negativePrompt: "",
    complexity: "SIMPLE",
    aspectRatio: "16:9",
    routingHint: "auto",
  };
}

const scenes = (count: number): ScenePlan[] =>
  Array.from({ length: count }, (_, i) => scene(i));

describe("applySceneCap — the truncation contract", () => {
  it("under the cap: everything returned, not truncated", () => {
    const outcome = applySceneCap(scenes(3), { maxScenes: 4, thumbnailOptions: [1, 2] });
    expect(outcome).toEqual({
      scenes: scenes(3),
      truncated: false,
      remainingScenes: 0,
    });
  });

  it("exactly at the cap: still not truncated (boundary is inclusive)", () => {
    const outcome = applySceneCap(scenes(4), { maxScenes: 4, thumbnailOptions: [1, 2] });
    expect(outcome.truncated).toBe(false);
    expect(outcome.remainingScenes).toBe(0);
    expect(outcome.scenes).toHaveLength(4);
  });

  it("over the cap: clipped, truncated=true, remainingScenes=excess", () => {
    const outcome = applySceneCap(scenes(10), { maxScenes: 4, thumbnailOptions: [1, 2] });
    expect(outcome.truncated).toBe(true);
    expect(outcome.remainingScenes).toBe(6);
    expect(outcome.scenes.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("keeps the FIRST scenes by index, not by array position", () => {
    // Shuffled input: the storyboard's beginning is index-order, not array-order.
    const shuffled = [scene(3), scene(0), scene(2), scene(1), scene(5), scene(4)];
    const outcome = applySceneCap(shuffled, { maxScenes: 3, thumbnailOptions: [1, 2] });
    expect(outcome.scenes.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(outcome.remainingScenes).toBe(3);
  });

  it("unlimited cap (cinematic) never truncates, however long the plan", () => {
    const outcome = applySceneCap(scenes(250), { maxScenes: null, thumbnailOptions: [1, 2, 4] });
    expect(outcome.scenes).toHaveLength(250);
    expect(outcome.truncated).toBe(false);
    expect(outcome.remainingScenes).toBe(0);
  });

  it("empty input is not a truncation", () => {
    const outcome = applySceneCap([], { maxScenes: 4, thumbnailOptions: [1, 2] });
    expect(outcome).toEqual({ scenes: [], truncated: false, remainingScenes: 0 });
  });

  it("never mutates the input array", () => {
    const input = scenes(10);
    applySceneCap(input, { maxScenes: 2, thumbnailOptions: [1, 2] });
    expect(input).toHaveLength(10);
    expect(input.map((s) => s.index)).toEqual(scenes(10).map((s) => s.index));
  });
});

describe("truncateForTier — policy-driven tiers end to end", () => {
  it.each([
    ["free", 4],
    ["pro", 8],
  ] as Array<[UserTier, number]>)("tier %s clips a 12-scene plan to %d", (tier, cap) => {
    const outcome = truncateForTier(scenes(12), tier);
    expect(outcome.scenes).toHaveLength(cap);
    expect(outcome.truncated).toBe(true);
    expect(outcome.remainingScenes).toBe(12 - cap);
  });

  it("cinematic serves the full plan", () => {
    const outcome = truncateForTier(scenes(12), "cinematic");
    expect(outcome.scenes).toHaveLength(12);
    expect(outcome.truncated).toBe(false);
  });

  it("respects env-overridden policies (TIER_LIMITS free maxScenes=2)", () => {
    const policy = new TierPolicy({
      free: { maxScenes: 2, thumbnailOptions: [1, 2] },
      pro: { maxScenes: 8, thumbnailOptions: [1, 2, 4] },
      cinematic: { maxScenes: null, thumbnailOptions: [1, 2, 4] },
    });
    const outcome = truncateForTier(scenes(6), "free", policy);
    expect(outcome.scenes.map((s) => s.index)).toEqual([0, 1]);
    expect(outcome.remainingScenes).toBe(4);
  });

  it("a free-tier storyboard payload shape: exactly the F3/G2 contract", () => {
    const outcome = truncateForTier(scenes(7), "free");
    // Fields the upsell banner and the API echo need — nothing more, nothing less:
    expect(Object.keys(outcome).sort()).toEqual(["remainingScenes", "scenes", "truncated"]);
    expect(outcome.truncated).toBe(true);
    expect(outcome.remainingScenes).toBe(3);
  });
});
