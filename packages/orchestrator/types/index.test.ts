import { describe, expect, it } from "vitest";

import { IMAGE_PROVIDER_IDS } from "../../shared/env/image-keys.js";
import { TIER_LIMIT_NAMES } from "../../shared/env/tier-limits.js";

import {
  ASPECT_RATIOS,
  GENERATION_STATUSES,
  PROVIDER_ERROR_KINDS,
  PROVIDER_IDS,
  PROVIDER_TIERS,
  ROUTING_HINTS,
  ROUTING_REASONS,
  SCENE_COMPLEXITIES,
  USER_TIERS,
  type DirectorOutput,
  type GenerationResult,
  type RoutingDecision,
  type ScenePlan,
} from "./index.js";

describe("frozen const arrays — the contract the plan pins", () => {
  it("SceneComplexity is exactly SIMPLE | COMPLEX (B3 vocabulary)", () => {
    expect(SCENE_COMPLEXITIES).toEqual(["SIMPLE", "COMPLEX"]);
  });

  it("aspect ratios are YouTube-centric canvases", () => {
    expect(ASPECT_RATIOS).toEqual(["16:9", "9:16", "1:1"]);
  });

  it("routing hints keep 'auto' as the defer-to-engine default", () => {
    expect(ROUTING_HINTS).toEqual(["auto", "prefer-premium", "prefer-free"]);
  });

  it("provider tiers are the C1 free/premium cost classes", () => {
    expect(PROVIDER_TIERS).toEqual(["free", "premium"]);
  });

  it("error taxonomy covers the D2 rotation triggers first", () => {
    expect(PROVIDER_ERROR_KINDS).toEqual([
      "rate_limit",
      "quota_exceeded",
      "auth",
      "provider_unavailable",
      "invalid_request",
      "timeout",
      "unknown",
    ]);
  });

  it("routing reasons end at the pollinations ultimate fallback", () => {
    expect(ROUTING_REASONS[0]).toBe("complexity-match");
    expect(ROUTING_REASONS[ROUTING_REASONS.length - 1]).toBe("pollinations-ultimate");
  });

  it("generation statuses match E3's success/failed outcomes", () => {
    expect(GENERATION_STATUSES).toEqual(["success", "failed"]);
  });
});

describe("cross-module sync invariants", () => {
  it("PROVIDER_IDS = keyed pools (A1) + pollinations ultimate fallback", () => {
    expect(PROVIDER_IDS).toEqual([...IMAGE_PROVIDER_IDS, "pollinations"]);
  });

  it("UserTier can never drift from env-validated tier names (A1)", () => {
    expect(USER_TIERS).toBe(TIER_LIMIT_NAMES);
  });

  it("no const array contains duplicates", () => {
    const arrays: ReadonlyArray<readonly string[]> = [
      SCENE_COMPLEXITIES,
      ASPECT_RATIOS,
      ROUTING_HINTS,
      PROVIDER_IDS,
      PROVIDER_TIERS,
      PROVIDER_ERROR_KINDS,
      ROUTING_REASONS,
      GENERATION_STATUSES,
    ];
    for (const arr of arrays) expect(new Set(arr).size).toBe(arr.length);
  });
});

describe("contract constructibility (tsc + runtime)", () => {
  const scene: ScenePlan = {
    index: 0,
    title: "Opening sky",
    prompt: "wide dawn sky over valley",
    negativePrompt: "no text",
    complexity: "SIMPLE",
    aspectRatio: "16:9",
    routingHint: "auto",
  };

  it("DirectorOutput accepts characterless scripts (null profile)", () => {
    const output: DirectorOutput = { characterProfile: null, scenes: [scene] };
    expect(output.scenes).toHaveLength(1);
    expect(output.characterProfile).toBeNull();
  });

  it("RoutingDecision carries fallbacks ending at pollinations", () => {
    const decision: RoutingDecision = {
      sceneIndex: scene.index,
      complexity: scene.complexity,
      providerId: "agnes",
      providerTier: "premium",
      reason: "complexity-match",
      fallbacks: ["gemini", "hf", "pollinations"],
      decidedAt: 1_750_000_000_000,
    };
    expect(decision.fallbacks[decision.fallbacks.length - 1]).toBe("pollinations");
  });

  it("GenerationResult models both success and total failure", () => {
    const ok: GenerationResult = {
      sceneIndex: 0,
      status: "success",
      imageUrl: "https://cdn.example/img.png",
      provider: "gemini",
      costTier: "premium",
      isFallback: false,
      attempts: 1,
      keyRotations: 0,
      latencyMs: 420,
    };
    const failed: GenerationResult = {
      sceneIndex: 1,
      status: "failed",
      isFallback: true,
      attempts: 4,
      keyRotations: 3,
      latencyMs: 9_800,
      error: "all providers unavailable",
    };
    expect(ok.isFallback).toBe(false);
    expect(failed.provider).toBeUndefined();
    expect(failed.error).not.toMatch(/sk-|key=/i);
  });
});
