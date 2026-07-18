import { describe, expect, it } from "vitest";

import type { GenerationResult, RoutingDecision } from "../types/index.js";

import { CostTracker } from "./cost-tracker.js";

const T0 = 1_700_000_000_000;

const decision = (over: Partial<RoutingDecision> = {}): RoutingDecision => ({
  sceneIndex: 0,
  complexity: "COMPLEX",
  providerId: "agnes",
  providerTier: "premium",
  reason: "complexity-match",
  fallbacks: ["gemini", "hf", "pollinations"],
  decidedAt: T0,
  ...over,
});

const outcome = (over: Partial<GenerationResult> = {}): GenerationResult => ({
  sceneIndex: 0,
  status: "success",
  provider: "agnes",
  costTier: "premium",
  isFallback: false,
  attempts: 1,
  keyRotations: 0,
  latencyMs: 300,
  ...over,
});

describe("CostTracker — decisions", () => {
  it("records decisions chronologically with sequence numbers", () => {
    const tracker = new CostTracker({ now: () => T0 });
    tracker.record(decision({ sceneIndex: 0 }));
    tracker.record(decision({ sceneIndex: 1 }));
    const entries = tracker.decisions();
    expect(entries.map((e) => e.seq)).toEqual([0, 1]);
    expect(entries.map((e) => e.sceneIndex)).toEqual([0, 1]);
    expect(entries[0].loggedAt).toBe(T0);
  });

  it("ring buffer retains the newest entries; total tracks lifetime", () => {
    const tracker = new CostTracker({ capacity: 3, now: () => T0 });
    for (let i = 0; i < 5; i += 1) tracker.record(decision({ sceneIndex: i }));
    const entries = tracker.decisions();
    expect(entries.map((e) => e.sceneIndex)).toEqual([2, 3, 4]);
    expect(tracker.summary().decisions.total).toBe(5);
  });

  it("summarizes decisions by reason, provider, and cost class", () => {
    const tracker = new CostTracker({ now: () => T0 });
    tracker.record(decision());
    tracker.record(decision({ sceneIndex: 1 }));
    tracker.record(
      decision({ sceneIndex: 2, providerId: "pollinations", providerTier: "free", reason: "pollinations-ultimate", fallbacks: [] }),
    );
    const s = tracker.summary().decisions;
    expect(s.total).toBe(3);
    expect(s.byReason).toEqual({ "complexity-match": 2, "pollinations-ultimate": 1 });
    expect(s.byProvider).toEqual({ agnes: 2, pollinations: 1 });
    expect(s.premiumRouted).toBe(2);
    expect(s.freeRouted).toBe(1);
  });

  it("coerces a zero capacity to the minimum ring", () => {
    const tracker = new CostTracker({ capacity: 0, now: () => T0 });
    tracker.record(decision({ sceneIndex: 0 }));
    tracker.record(decision({ sceneIndex: 1 }));
    expect(tracker.decisions()).toHaveLength(1);
  });
});

describe("CostTracker — outcomes", () => {
  it("aggregates success/failure, fallbacks, rotations, latency, premium units", () => {
    const tracker = new CostTracker({ now: () => T0 });
    tracker.recordOutcome(outcome({ latencyMs: 300, costTier: "premium" }));
    tracker.recordOutcome(
      outcome({ sceneIndex: 1, provider: "hf", costTier: "free", isFallback: true, keyRotations: 2, latencyMs: 900 }),
    );
    tracker.recordOutcome(
      outcome({ sceneIndex: 2, status: "failed", provider: undefined, costTier: undefined, latencyMs: 100 }),
    );
    const o = tracker.summary().outcomes;
    expect(o.recorded).toBe(3);
    expect(o.succeeded).toBe(2);
    expect(o.failed).toBe(1);
    expect(o.fallbacks).toBe(1);
    expect(o.totalKeyRotations).toBe(2);
    expect(o.avgLatencyMs).toBe(433);
    expect(o.estimatedPremiumUnits).toBe(1);
  });

  it("honors the outcome capacity window", () => {
    const tracker = new CostTracker({ outcomeCapacity: 2, now: () => T0 });
    tracker.recordOutcome(outcome({ sceneIndex: 0 }));
    tracker.recordOutcome(outcome({ sceneIndex: 1 }));
    tracker.recordOutcome(outcome({ sceneIndex: 2 }));
    expect(tracker.outcomes().map((e) => e.sceneIndex)).toEqual([1, 2]);
    expect(tracker.summary().outcomes.recorded).toBe(2);
  });

  it("handles an empty ledger without division errors", () => {
    const s = new CostTracker({ now: () => T0 }).summary();
    expect(s.outcomes.avgLatencyMs).toBe(0);
    expect(s.decisions.total).toBe(0);
  });
});
