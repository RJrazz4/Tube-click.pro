import { describe, expect, it } from "vitest";

import {
  defaultTierLimits,
  parseTierLimits,
  type ThumbnailOption,
} from "../../shared/env/tier-limits.js";
import type { UserTier } from "../types/index.js";

import {
  TierPolicy,
  ThumbnailCountNotAllowedError,
  TIER_CATALOG_NAMES,
} from "./tier-policy.js";

describe("TierPolicy — plan F1 conformance", () => {
  const policy = new TierPolicy();

  it.each([
    ["free", 4, [1, 2]],
    ["pro", 8, [1, 2, 4]],
    ["cinematic", null, [1, 2, 4]],
  ] as Array<[UserTier, number | null, ThumbnailOption[]]>)(
    "tier %s: maxScenes %s, thumbnailOptions %j",
    (tier, maxScenes, options) => {
      expect(policy.maxScenes(tier)).toBe(maxScenes);
      expect(policy.thumbnailOptions(tier)).toEqual(options);
      expect(policy.limits(tier)).toEqual({ maxScenes, thumbnailOptions: options });
    },
  );

  it("unlimited scenes belong to cinematic only", () => {
    expect(policy.allowsUnlimitedScenes("cinematic")).toBe(true);
    expect(policy.allowsUnlimitedScenes("free")).toBe(false);
    expect(policy.allowsUnlimitedScenes("pro")).toBe(false);
  });

  it("catalog names stay synced with A1's tier-name source", () => {
    expect([...TIER_CATALOG_NAMES]).toEqual(["free", "pro", "cinematic"]);
  });
});

describe("TierPolicy — env override (A1 wiring)", () => {
  it("respects TIER_LIMITS overrides, deep-merged over plan defaults", () => {
    const limits = parseTierLimits(
      JSON.stringify({ free: { maxScenes: 6 }, pro: { thumbnailOptions: [2, 4] } }),
      () => {},
    );
    expect(limits).not.toBeNull();
    const policy = new TierPolicy(limits ?? defaultTierLimits());

    expect(policy.maxScenes("free")).toBe(6);
    expect(policy.thumbnailOptions("pro")).toEqual([2, 4]);
    // untouched tiers keep plan values:
    expect(policy.maxScenes("pro")).toBe(8);
    expect(policy.maxScenes("cinematic")).toBeNull();
  });

  it("builds straight from a validated AppEnv (fromEnv)", () => {
    const policy = TierPolicy.fromEnv({ tierLimits: defaultTierLimits() });
    expect(policy.maxScenes("free")).toBe(4);
  });

  it("is immutable: mutating the source table afterwards changes nothing", () => {
    const source = defaultTierLimits();
    const policy = new TierPolicy(source);
    source.free.maxScenes = 999;
    source.free.thumbnailOptions.push(4);

    expect(policy.maxScenes("free")).toBe(4);
    expect(policy.thumbnailOptions("free")).toEqual([1, 2]);
  });

  it("getters return fresh copies — callers cannot mutate policy state", () => {
    const policy = new TierPolicy();
    policy.thumbnailOptions("free").push(4);
    policy.limits("pro").thumbnailOptions.length = 0;

    expect(policy.thumbnailOptions("free")).toEqual([1, 2]);
    expect(policy.thumbnailOptions("pro")).toEqual([1, 2, 4]);
  });
});

describe("TierPolicy — thumbnail count resolution", () => {
  const policy = new TierPolicy();

  it("no request → the cheapest option (never the expensive one by accident)", () => {
    expect(policy.resolveThumbnailCount("free")).toBe(1);
    expect(policy.resolveThumbnailCount("pro")).toBe(1);
    expect(policy.resolveThumbnailCount("cinematic")).toBe(1);
  });

  it("allowed counts pass through", () => {
    expect(policy.resolveThumbnailCount("free", 2)).toBe(2);
    expect(policy.resolveThumbnailCount("pro", 4)).toBe(4);
    expect(policy.resolveThumbnailCount("cinematic", 4)).toBe(4);
  });

  it.each([
    ["free", 4],
    ["free", 0],
    ["pro", 3],
    ["cinematic", 8],
    ["free", -1],
  ] as Array<[UserTier, number]>)(
    "tier %s requesting %d thumbnails → loud rejection, never silent clamp",
    (tier, requested) => {
      expect(policy.isThumbnailCountAllowed(tier, requested)).toBe(false);
      expect(() => policy.resolveThumbnailCount(tier, requested)).toThrow(
        ThumbnailCountNotAllowedError,
      );
    },
  );

  it("the rejection error carries tier, request, and allowed options (F3's 400 body)", () => {
    try {
      new TierPolicy().resolveThumbnailCount("free", 4);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ThumbnailCountNotAllowedError);
      const notAllowed = err as ThumbnailCountNotAllowedError;
      expect(notAllowed.tier).toBe("free");
      expect(notAllowed.requested).toBe(4);
      expect(notAllowed.allowed).toEqual([1, 2]);
      expect(notAllowed.message).toBe('tier "free" allows thumbnail counts [1, 2] — got 4');
    }
  });
});

describe("TierPolicy — public catalog (F3's GET /api/v1/tiers)", () => {
  it("emits the full tier catalog in stable order, JSON-serializable", () => {
    const catalog = new TierPolicy().catalog();

    expect(catalog.map((entry) => entry.tier)).toEqual(["free", "pro", "cinematic"]);
    expect(catalog).toEqual([
      { tier: "free", maxScenes: 4, unlimitedScenes: false, thumbnailOptions: [1, 2] },
      { tier: "pro", maxScenes: 8, unlimitedScenes: false, thumbnailOptions: [1, 2, 4] },
      { tier: "cinematic", maxScenes: null, unlimitedScenes: true, thumbnailOptions: [1, 2, 4] },
    ]);
    expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
  });
});
