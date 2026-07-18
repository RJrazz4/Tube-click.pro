import { describe, expect, it } from "vitest";

import {
  toTruncationBanner,
  ENGINE_TIER_COPY,
} from "./truncation-banner-view";
import type { OrchestratorStoryboardResponse } from "./types";

/** Gate 4 mirror (see storyboard-view.test.ts). */
const BANNED = /pollinations|snapgen|fal\.ai|openrouter|gemini|deno|supabase edge|no api|api[\s-]?keys?|server maps/i;

function body(overrides: Partial<OrchestratorStoryboardResponse> = {}): OrchestratorStoryboardResponse {
  return {
    tier: "free",
    plannedScenes: 7,
    generatedScenes: 4,
    truncated: true,
    remainingScenes: 3,
    characterProfile: null,
    scenes: [],
    summary: {
      total: 4, succeeded: 4, failed: 0, fallbackTriggered: 0,
      premiumScenes: 0, totalKeyRotations: 0, avgLatencyMs: 900,
    },
    meta: { model: "m", attempts: 1, complexityOverrides: 0, llmLatencyMs: 5 },
    ...overrides,
  };
}

describe("truncation banner view-model", () => {
  it("renders nothing when not truncated (or remaining is zero)", () => {
    expect(toTruncationBanner(body({ truncated: false, remainingScenes: 0 }))).toBeNull();
    expect(toTruncationBanner(body({ truncated: true, remainingScenes: 0 }))).toBeNull();
  });

  it("free → Pro upsell with exact counts and copy", () => {
    const view = toTruncationBanner(body());
    expect(view).not.toBeNull();
    expect(view).toMatchObject({
      remainingScenes: 3,
      plannedScenes: 7,
      generatedScenes: 4,
      upgradeTier: "pro",
      ctaLabel: "See Pro plans",
    });
    expect(view?.title).toBe("3 more scenes waiting beyond your plan");
    expect(view?.message).toContain("The director planned 7 scenes");
    expect(view?.message).toContain("Free renders up to 4 scenes per storyboard");
    expect(view?.message).toContain("Pro unlocks up to 8 scenes");
  });

  it("pro → Cinematic upsell", () => {
    const view = toTruncationBanner(
      body({ tier: "pro", plannedScenes: 12, generatedScenes: 8, remainingScenes: 4 }),
    );
    expect(view?.upgradeTier).toBe("cinematic");
    expect(view?.ctaLabel).toBe("See Cinematic plans");
    expect(view?.message).toContain("Pro renders up to 8 scenes per storyboard");
    expect(view?.message).toContain("Cinematic unlocks unlimited scenes");
  });

  it("cinematic truncated (env-capped deployment): counts without an upsell CTA", () => {
    const view = toTruncationBanner(
      body({ tier: "cinematic", plannedScenes: 20, generatedScenes: 15, remainingScenes: 5 }),
    );
    expect(view?.upgradeTier).toBeNull();
    expect(view?.ctaLabel).toBeNull();
    expect(view?.message).toContain("20 scenes");
    expect(view?.message).toContain("15 scenes");
    expect(view?.message).not.toContain("unlocks");
  });

  it("grammar stays exact at the singular boundary", () => {
    const view = toTruncationBanner(
      body({ plannedScenes: 5, generatedScenes: 4, remainingScenes: 1 }),
    );
    expect(view?.title).toBe("1 more scene waiting beyond your plan");
    expect(view?.message).toContain("planned 5 scenes");
  });

  it("tier copy table mirrors the plan values", () => {
    expect(ENGINE_TIER_COPY.free.capLabel).toBe("up to 4 scenes");
    expect(ENGINE_TIER_COPY.pro.capLabel).toBe("up to 8 scenes");
    expect(ENGINE_TIER_COPY.cinematic.capLabel).toBe("unlimited scenes");
  });
});

describe("Gate 4 copy safety (unit-locked)", () => {
  it("banner strings never carry infrastructure terms", () => {
    const views = [
      toTruncationBanner(body()),
      toTruncationBanner(body({ tier: "pro" })),
      toTruncationBanner(body({ tier: "cinematic" })),
    ];
    for (const view of views) {
      if (view === null) continue;
      for (const value of [view.title, view.message, view.ctaLabel ?? ""]) {
        expect(BANNED.test(value)).toBe(false);
      }
    }
  });
});
