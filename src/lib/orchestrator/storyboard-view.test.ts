import { describe, expect, it } from "vitest";

import {
  brandBadge,
  latencyLabel,
  toEngineTier,
  toSceneCardViews,
  toSummaryStrip,
} from "./storyboard-view";
import type { OrchestratorStoryboardResponse } from "./types";

/**
 * Gate 4 mirror: provider-term regex from scripts/verify.mjs. The gate
 * scans .tsx literals; THIS test locks the view-model so user-facing
 * copy can never carry infrastructure names, wherever it is rendered.
 */
const BANNED = /pollinations|snapgen|fal\.ai|openrouter|gemini|deno|supabase edge|no api|api[\s-]?keys?|server maps/i;

function body(overrides: Partial<OrchestratorStoryboardResponse> = {}): OrchestratorStoryboardResponse {
  return {
    tier: "free",
    plannedScenes: 2,
    generatedScenes: 2,
    truncated: false,
    remainingScenes: 0,
    characterProfile: null,
    scenes: [
      {
        sceneIndex: 0,
        status: "success",
        imageUrl: "https://cdn.example.test/s0.png",
        costTier: "premium",
        isFallback: false,
        attempts: 1,
        latencyMs: 1200,
      },
      {
        sceneIndex: 1,
        status: "failed",
        costTier: "free",
        isFallback: true,
        attempts: 3,
        latencyMs: 400,
        error: "all routed providers failed",
      },
    ],
    summary: {
      total: 2,
      succeeded: 1,
      failed: 1,
      fallbackTriggered: 1,
      premiumScenes: 1,
      totalKeyRotations: 1,
      avgLatencyMs: 800,
    },
    meta: { model: "m", attempts: 1, complexityOverrides: 0, llmLatencyMs: 5 },
    ...overrides,
  };
}

describe("storyboard view-model — card mapping", () => {
  it("maps rows to render-ready cards with brand badges", () => {
    const views = toSceneCardViews(body());
    expect(views).toHaveLength(2);

    expect(views[0]).toMatchObject({
      sceneIndex: 0,
      title: "Scene 1",
      status: "success",
      imageUrl: "https://cdn.example.test/s0.png",
      qualityBadge: "Tube.Pro",
      backupBadge: false,
      latencyLabel: "1.2s",
    });
    expect(views[1]).toMatchObject({
      title: "Scene 2",
      status: "failed",
      qualityBadge: "Tube.Flash",
      backupBadge: true,
      latencyLabel: "400ms",
      errorMessage: "all routed providers failed",
    });
    expect(views[1]?.imageUrl).toBeUndefined();
  });

  it("brandBadge maps cost tiers to brand names only", () => {
    expect(brandBadge("premium")).toBe("Tube.Pro");
    expect(brandBadge("free")).toBe("Tube.Flash");
    expect(brandBadge(undefined)).toBeNull();
  });

  it("latencyLabel switches units at the second boundary", () => {
    expect(latencyLabel(999)).toBe("999ms");
    expect(latencyLabel(1000)).toBe("1.0s");
    expect(latencyLabel(2500)).toBe("2.5s");
  });

  it("summary strip reports rendered counts and fallback notes", () => {
    expect(toSummaryStrip(body())).toEqual({
      headline: "1 of 2 scenes rendered",
      fallbackNote: "1 used the backup engine",
    });
    expect(
      toSummaryStrip(body({ summary: { ...body().summary, fallbackTriggered: 0, total: 1, succeeded: 1 } })),
    ).toEqual({ headline: "1 of 1 scene rendered", fallbackNote: null });
  });
});

describe("storyboard view-model — tier mapping", () => {
  it("maps store tiers onto engine tiers", () => {
    expect(toEngineTier("free")).toBe("free");
    expect(toEngineTier("pro")).toBe("pro");
    expect(toEngineTier("enterprise")).toBe("cinematic");
    expect(toEngineTier("cinematic")).toBe("cinematic");
    expect(toEngineTier("anything-else")).toBe("free");
  });
});

describe("Gate 4 copy safety (unit-locked)", () => {
  it("no user-facing view string can carry infrastructure terms", () => {
    const views = toSceneCardViews(body());
    const strip = toSummaryStrip(body());
    const strings: string[] = [
      ...views.flatMap((view) => [
        view.title,
        view.qualityBadge ?? "",
        view.backupBadge ? "backup engine" : "",
        view.latencyLabel,
      ]),
      strip.headline,
      strip.fallbackNote ?? "",
    ];
    for (const value of strings) {
      expect(BANNED.test(value)).toBe(false);
    }
  });
});
