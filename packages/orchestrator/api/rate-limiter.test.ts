import { describe, expect, it } from "vitest";

import { TierPolicy } from "../tiers/index.js";
import type { ScenePlan } from "../types/index.js";

import {
  DEFAULT_MAX_BUCKETS,
  DEFAULT_RATE_LIMIT_RULES,
  TierRateLimiter,
} from "./rate-limiter.js";
import { rateLimitHeaders } from "./types.js";
import {
  handleStoryboard,
  type StoryboardPlanner,
  type StoryboardResponseBody,
} from "./storyboard-handler.js";
import type { AnalyzeResult } from "../manager/index.js";
import type { ApiErrorBody } from "./types.js";

function clock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("TierRateLimiter — token bucket by tier", () => {
  it("plan defaults: free < pro < cinematic, exact numbers", () => {
    expect(DEFAULT_RATE_LIMIT_RULES).toEqual({
      free: { capacity: 10, refillPerMinute: 10 },
      pro: { capacity: 60, refillPerMinute: 60 },
      cinematic: { capacity: 300, refillPerMinute: 300 },
    });
    expect(DEFAULT_MAX_BUCKETS).toBe(10_000);
  });

  it("free tier: 10 in a burst, then denied with the exact 6-second wait", () => {
    const limiter = new TierRateLimiter();
    for (let i = 0; i < 10; i += 1) {
      const verdict = limiter.check("free", "user-1");
      expect(verdict.allowed).toBe(true);
      expect(verdict.remaining).toBe(9 - i);
    }
    const denied = limiter.check("free", "user-1");
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSeconds).toBe(6); // 10/min => one token per 6s
  });

  it("headers: Retry-After only when denied, limits always present", () => {
    const limiter = new TierRateLimiter({
      rules: { free: { capacity: 1, refillPerMinute: 60 } },
    });
    const allowed = rateLimitHeaders(limiter.check("free", "u"));
    expect(allowed).toEqual({
      "X-RateLimit-Limit": "1",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": allowed["X-RateLimit-Reset"],
    });
    expect(allowed["Retry-After"]).toBeUndefined();

    const denied = rateLimitHeaders(limiter.check("free", "u"));
    expect(denied["Retry-After"]).toBe("1");
    expect(denied["X-RateLimit-Remaining"]).toBe("0");
  });

  it("lazy refill: tokens come back at the sustained rate, capped at capacity", () => {
    const c = clock();
    const limiter = new TierRateLimiter({
      rules: { pro: { capacity: 2, refillPerMinute: 60 } },
      now: c.now,
    }); // 1 token per second

    limiter.check("pro", "u");
    limiter.check("pro", "u");
    expect(limiter.check("pro", "u").allowed).toBe(false); // empty

    c.advance(1_000);
    expect(limiter.check("pro", "u").allowed).toBe(true); // exactly 1 back
    expect(limiter.check("pro", "u").allowed).toBe(false); // and spent again

    c.advance(60_000);
    const verdict = limiter.check("pro", "u");
    expect(verdict.allowed).toBe(true);
    expect(verdict.remaining).toBe(1); // refilled to capacity 2, minus this request
  });

  it("per-tier independence: free denial does not consume the pro budget", () => {
    const limiter = new TierRateLimiter({
      rules: { free: { capacity: 1, refillPerMinute: 1 } },
    });
    expect(limiter.check("free", "u").allowed).toBe(true);
    expect(limiter.check("free", "u").allowed).toBe(false);
    expect(limiter.check("pro", "u").allowed).toBe(true); // fresh bucket per tier
  });

  it("per-client independence: one abusive client never starves another", () => {
    const limiter = new TierRateLimiter({
      rules: { free: { capacity: 1, refillPerMinute: 1 } },
    });
    limiter.check("free", "greedy");
    expect(limiter.check("free", "greedy").allowed).toBe(false);
    expect(limiter.check("free", "innocent").allowed).toBe(true);
  });

  it("partial rule overrides merge over defaults per tier", () => {
    const limiter = new TierRateLimiter({ rules: { free: { capacity: 3 } } });
    expect(limiter.ruleFor("free")).toEqual({ capacity: 3, refillPerMinute: 10 });
    expect(limiter.ruleFor("pro")).toEqual({ capacity: 60, refillPerMinute: 60 });
  });

  it("reset(): one identity (all tiers) or the whole map", () => {
    const limiter = new TierRateLimiter({ rules: { free: { capacity: 1 } } });
    limiter.check("free", "u1");
    limiter.check("pro", "u1");
    limiter.check("free", "u2");

    limiter.reset("u1");
    expect(limiter.bucketCount).toBe(1);
    expect(limiter.check("free", "u1").allowed).toBe(true); // fresh again

    limiter.reset();
    expect(limiter.bucketCount).toBe(0);
  });
});

describe("TierRateLimiter — 10k memory contract", () => {
  it("the bucket map is bounded; the least-recently-touched identity is evicted", () => {
    const c = clock();
    const limiter = new TierRateLimiter({ maxBuckets: 3, now: c.now });

    limiter.check("free", "a");
    c.advance(1);
    limiter.check("free", "b");
    c.advance(1);
    limiter.check("free", "c");
    c.advance(1);
    // b touches (becomes recent), then a new identity overflows the map:
    limiter.check("free", "b");
    c.advance(1);
    limiter.check("free", "d");

    expect(limiter.bucketCount).toBe(3);
    // "a" was the oldest-touched: evicted, so it starts with a full bucket.
    const verdictA = limiter.check("free", "a");
    expect(verdictA.remaining).toBe(9); // capacity 10 minus this request
  });
});

describe("F4 × F3 — limiter through the real handler", () => {
  const scene = (index: number): ScenePlan => ({
    index,
    title: `Scene ${index}`,
    prompt: `prompt ${index}`,
    negativePrompt: "",
    complexity: "SIMPLE",
    aspectRatio: "16:9",
    routingHint: "auto",
  });
  const planner: StoryboardPlanner = {
    analyzeScript: async (): Promise<AnalyzeResult> => ({
      output: { characterProfile: null, scenes: [scene(0)] },
      meta: { model: "stub", attempts: 1, complexityOverrides: 0, llmLatencyMs: 1 },
    }),
  };
  const SCRIPT = { script: "Another script long enough to pass validation." };

  it("capacity 1: first storyboard 200s, the second is a 429 with headers", async () => {
    const limiter = new TierRateLimiter({ rules: { free: { capacity: 1, refillPerMinute: 60 } } });
    const deps = { policy: new TierPolicy(), planner, providers: [], rateLimiter: limiter };
    const auth = { tier: "free" as const, clientId: "limited-user" };

    const first = await handleStoryboard(SCRIPT, auth, deps);
    expect(first.status).toBe(200);
    expect((first.body as StoryboardResponseBody).plannedScenes).toBe(1);
    expect(first.headers?.["X-RateLimit-Remaining"]).toBe("0");
    expect(first.headers?.["Retry-After"]).toBeUndefined();

    const second = await handleStoryboard(SCRIPT, auth, deps);
    expect(second.status).toBe(429);
    expect((second.body as ApiErrorBody).error.code).toBe("rate_limit_exceeded");
    expect(second.headers?.["Retry-After"]).toBe("1");
    expect(second.headers?.["X-RateLimit-Limit"]).toBe("1");
  });
});
