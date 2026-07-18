import { describe, expect, it } from "vitest";

import {
  allowedThumbnailCounts,
  clampThumbnailCount,
  FALLBACK_TIER_CATALOG,
  optionFilename,
  thumbnailOptionViews,
  toThumbnailCardViews,
} from "./thumbnails-view";
import type {
  OrchestratorThumbnailsResponse,
  TierCatalogEntry,
} from "./types";

/** Gate 4 mirror (see storyboard-view.test.ts). */
const BANNED = /pollinations|snapgen|fal\.ai|openrouter|gemini|deno|supabase edge|no api|api[\s-]?keys?|server maps/i;

describe("thumbnail count selector — F1-faithful options", () => {
  it.each([
    ["free", [1, 2]],
    ["pro", [1, 2, 4]],
    ["cinematic", [1, 2, 4]],
  ] as const)("tier %s sees exactly %j", (tier, counts) => {
    expect(allowedThumbnailCounts(FALLBACK_TIER_CATALOG, tier)).toEqual(counts);
    expect(thumbnailOptionViews(FALLBACK_TIER_CATALOG, tier).map((o) => o.count)).toEqual(counts);
  });

  it("labels are grammatically exact", () => {
    expect(thumbnailOptionViews(FALLBACK_TIER_CATALOG, "pro").map((o) => o.label)).toEqual([
      "1 option",
      "2 options",
      "4 options",
    ]);
  });

  it("unknown tiers fall back to free's options (never an empty selector)", () => {
    expect(allowedThumbnailCounts(FALLBACK_TIER_CATALOG, "wizard" as never)).toEqual([1, 2]);
    expect(allowedThumbnailCounts([], "pro")).toEqual([1]);
  });

  it("server-provided catalog wins over the fallback", () => {
    const custom: TierCatalogEntry[] = [
      { tier: "free", maxScenes: 4, unlimitedScenes: false, thumbnailOptions: [1] },
      { tier: "pro", maxScenes: 8, unlimitedScenes: false, thumbnailOptions: [2, 4] },
      { tier: "cinematic", maxScenes: null, unlimitedScenes: true, thumbnailOptions: [1, 2, 4] },
    ];
    expect(allowedThumbnailCounts(custom, "free")).toEqual([1]);
    expect(allowedThumbnailCounts(custom, "pro")).toEqual([2, 4]);
  });

  it("clampThumbnailCount keeps choices inside the tier set", () => {
    expect(clampThumbnailCount([1, 2], 4)).toBe(2); // free asking 4 → 2, never above max
    expect(clampThumbnailCount([1, 2], 1)).toBe(1);
    expect(clampThumbnailCount([1, 2, 4], 3)).toBe(2); // nearest lower allowed
    expect(clampThumbnailCount([], 3)).toBe(1);
    expect(clampThumbnailCount([2, 4], 1)).toBe(2); // below the floor → first allowed
  });
});

describe("thumbnail card mapping", () => {
  function body(): OrchestratorThumbnailsResponse {
    return {
      tier: "pro",
      count: 2,
      thumbnails: [
        {
          sceneIndex: 0,
          status: "success",
          imageUrl: "https://cdn.example.test/t0.png",
          costTier: "free",
          isFallback: false,
          attempts: 1,
          latencyMs: 900,
        },
        {
          sceneIndex: 1,
          status: "failed",
          costTier: "free",
          isFallback: true,
          attempts: 2,
          latencyMs: 300,
          error: "all routed providers failed",
        },
      ],
      summary: {
        total: 2, succeeded: 1, failed: 1, fallbackTriggered: 1,
        premiumScenes: 0, totalKeyRotations: 0, avgLatencyMs: 600,
      },
    };
  }

  it("maps rows to Option N cards with brand + backup badges", () => {
    const views = toThumbnailCardViews(body());
    expect(views[0]).toMatchObject({
      title: "Option 1",
      status: "success",
      qualityBadge: "Tube.Flash",
      backupBadge: false,
      latencyLabel: "900ms",
    });
    expect(views[1]).toMatchObject({
      title: "Option 2",
      status: "failed",
      backupBadge: true,
      errorMessage: "all routed providers failed",
    });
  });

  it("option filenames are stable and 1-based", () => {
    expect(optionFilename(0)).toBe("thumbnail-option-1.png");
    expect(optionFilename(3)).toBe("thumbnail-option-4.png");
  });
});

describe("Gate 4 copy safety (unit-locked)", () => {
  it("selector + card strings never carry infrastructure terms", () => {
    const strings = [
      ...thumbnailOptionViews(FALLBACK_TIER_CATALOG, "cinematic").map((o) => o.label),
      ...toThumbnailCardViews({
        tier: "pro",
        count: 1,
        thumbnails: [
          {
            sceneIndex: 0,
            status: "success",
            imageUrl: "x",
            costTier: "premium",
            isFallback: true,
            attempts: 1,
            latencyMs: 100,
          },
        ],
        summary: {
          total: 1, succeeded: 1, failed: 0, fallbackTriggered: 1,
          premiumScenes: 1, totalKeyRotations: 0, avgLatencyMs: 100,
        },
      }).flatMap((v) => [v.title, v.qualityBadge ?? "", v.backupBadge ? "backup engine" : ""]),
    ];
    for (const value of strings) {
      expect(BANNED.test(value)).toBe(false);
    }
  });
});
