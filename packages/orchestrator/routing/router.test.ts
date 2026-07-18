import { describe, expect, it } from "vitest";

import type {
  ProviderId,
  ProviderTier,
  RoutingDecision,
  ScenePlan,
} from "../types/index.js";

import {
  route,
  RoutingImpossibleError,
  type RoutableProvider,
} from "./router.js";

const T0 = 1_700_000_000_000;

const mk = (
  id: ProviderId,
  opts: { tier?: ProviderTier; available?: boolean } = {},
): RoutableProvider => ({
  id,
  tier: opts.tier ?? (id === "agnes" || id === "gemini" ? "premium" : "free"),
  keyless: id === "pollinations",
  isAvailable: () => opts.available ?? true,
});

const allFour = () => [mk("agnes"), mk("gemini"), mk("hf"), mk("pollinations")];

const scene = (over: Partial<ScenePlan> = {}): ScenePlan => ({
  index: 3,
  title: "t",
  prompt: "p",
  negativePrompt: "",
  complexity: "COMPLEX",
  aspectRatio: "16:9",
  routingHint: "auto",
  ...over,
});

describe("route — primary selection (free-first mandate)", () => {
  it("COMPLEX + pro routes premium first, pollinations tail", () => {
    const d = route(scene(), { tier: "pro", providers: allFour(), now: () => T0 });
    expect(d.providerId).toBe("agnes");
    expect(d.providerTier).toBe("premium");
    expect(d.reason).toBe("complexity-match");
    expect(d.fallbacks).toEqual(["gemini", "hf", "pollinations"]);
    expect(d.sceneIndex).toBe(3);
    expect(d.decidedAt).toBe(T0);
  });

  it("SIMPLE + pro never touches premium (margin lock)", () => {
    const d = route(scene({ complexity: "SIMPLE" }), {
      tier: "cinematic",
      providers: allFour(),
      now: () => T0,
    });
    expect(d.providerId).toBe("hf");
    expect(d.providerTier).toBe("free");
    expect(d.reason).toBe("complexity-match");
    expect(d.fallbacks).toEqual(["pollinations"]);
  });

  it("COMPLEX + free tier is walled off premium (reason user-tier)", () => {
    const d = route(scene(), { tier: "free", providers: allFour(), now: () => T0 });
    expect(d.providerId).toBe("hf");
    expect(d.reason).toBe("user-tier");
    expect(d.fallbacks).toEqual(["pollinations"]);
  });

  it("SIMPLE + free tier is naturally free (reason complexity-match)", () => {
    const d = route(scene({ complexity: "SIMPLE" }), {
      tier: "free",
      providers: allFour(),
      now: () => T0,
    });
    expect(d.providerId).toBe("hf");
    expect(d.reason).toBe("complexity-match");
  });

  it("a free-tier prefer-premium hint cannot escalate the tier", () => {
    const d = route(scene({ routingHint: "prefer-premium" }), {
      tier: "free",
      providers: allFour(),
      now: () => T0,
    });
    expect(d.providerId).toBe("hf");
    expect(d.reason).toBe("user-tier");
  });
});

describe("route — routing hints", () => {
  it("prefer-premium lifts a SIMPLE scene into the premium chain", () => {
    const d = route(scene({ complexity: "SIMPLE", routingHint: "prefer-premium" }), {
      tier: "pro",
      providers: allFour(),
      now: () => T0,
    });
    expect(d.providerId).toBe("agnes");
    expect(d.reason).toBe("routing-hint");
    expect(d.fallbacks).toEqual(["gemini", "hf", "pollinations"]);
  });

  it("prefer-free keeps a COMPLEX scene on free providers", () => {
    const d = route(scene({ routingHint: "prefer-free" }), {
      tier: "pro",
      providers: allFour(),
      now: () => T0,
    });
    expect(d.providerId).toBe("hf");
    expect(d.reason).toBe("routing-hint");
    expect(d.fallbacks).toEqual(["pollinations"]);
  });
});

describe("route — health and availability eviction", () => {
  it("health=down evicts the natural primary (reason provider-health)", () => {
    const d = route(scene(), {
      tier: "pro",
      providers: allFour(),
      health: { agnes: "down" },
      now: () => T0,
    });
    expect(d.providerId).toBe("gemini");
    expect(d.reason).toBe("provider-health");
    expect(d.fallbacks).toEqual(["hf", "pollinations"]);
  });

  it("unconfigured (no keys) providers are skipped the same way", () => {
    const d = route(scene(), {
      tier: "pro",
      providers: [mk("agnes", { available: false }), mk("gemini"), mk("hf"), mk("pollinations")],
      now: () => T0,
    });
    expect(d.providerId).toBe("gemini");
    expect(d.reason).toBe("provider-health");
  });

  it("degraded stays in place (pre-D4 breaker semantics)", () => {
    const d = route(scene(), {
      tier: "pro",
      providers: allFour(),
      health: { agnes: "degraded" },
      now: () => T0,
    });
    expect(d.providerId).toBe("agnes");
  });
});

describe("route — ultimate fallback and impossible states", () => {
  it("pollinations serves as primary when it is the only usable provider", () => {
    const d = route(scene(), {
      tier: "pro",
      providers: [mk("pollinations")],
      now: () => T0,
    });
    expect(d.providerId).toBe("pollinations");
    expect(d.providerTier).toBe("free");
    expect(d.reason).toBe("pollinations-ultimate");
    expect(d.fallbacks).toEqual([]);
  });

  it("throws RoutingImpossibleError when nothing is usable (never silent)", () => {
    expect(() =>
      route(scene(), {
        tier: "free",
        providers: [mk("hf", { available: false })],
        now: () => T0,
      }),
    ).toThrow(RoutingImpossibleError);
  });

  it("pollinations is ALWAYS the tail of the fallback chain", () => {
    const d = route(scene({ routingHint: "prefer-free" }), {
      tier: "pro",
      providers: [mk("hf"), mk("pollinations"), mk("agnes")],
      now: () => T0,
    });
    expect(d.fallbacks[d.fallbacks.length - 1]).toBe("pollinations");
  });
});

describe("route — C4 tracker hook", () => {
  it("records every decision exactly once", () => {
    const logged: RoutingDecision[] = [];
    route(scene(), {
      tier: "pro",
      providers: allFour(),
      now: () => T0,
      tracker: { record: (d) => logged.push(d) },
    });
    expect(logged).toHaveLength(1);
    expect(logged[0].providerId).toBe("agnes");
  });
});
