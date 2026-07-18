import { describe, expect, it } from "vitest";

import {
  NormalizedProviderError,
  type ImageGenerateRequest,
  type ImageGenerateResult,
  type ImageProvider,
  type ProviderHealthReport,
} from "../providers/index.js";
import type {
  ProviderErrorKind,
  ProviderId,
  ProviderTier,
  RoutingDecision,
} from "../types/index.js";

import {
  CircuitBreaker,
  DEFAULT_FAILURE_THRESHOLD,
} from "./circuit-breaker.js";
import { detect, DEFAULT_PROVIDER_COOLDOWN_MS } from "./detector.js";
import { executeWithFallback } from "./fallback-executor.js";

/** Deterministic manual clock. */
function clock(start = 0): { now: () => number; advance: (ms: number) => void; read: () => number } {
  let t = start;
  return {
    now: () => t,
    read: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const failing = (
  provider: ProviderId,
  kind: ProviderErrorKind,
  retryAfterMs?: number,
) =>
  detect(
    new NormalizedProviderError(
      provider,
      kind,
      `${provider} boom`,
      retryAfterMs === undefined ? {} : { retryAfterMs },
    ),
    provider,
  );

describe("CircuitBreaker — state machine", () => {
  it("is closed by default, passes traffic, and reports nothing", () => {
    const breaker = new CircuitBreaker();
    expect(breaker.state("hf")).toBe("closed");
    expect(breaker.isRequestAllowed("hf")).toBe(true);
    expect(breaker.healthMap()).toEqual({});
    expect(breaker.snapshot()).toEqual([]);
  });

  it("opens exactly at the failure threshold and blocks requests", () => {
    const c = clock(1_000);
    const breaker = new CircuitBreaker({ now: c.now });

    for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD - 1; i += 1) {
      breaker.recordFailure("hf", failing("hf", "rate_limit"));
    }
    expect(breaker.state("hf")).toBe("closed");
    expect(breaker.isRequestAllowed("hf")).toBe(true);

    breaker.recordFailure("hf", failing("hf", "rate_limit"));
    expect(breaker.state("hf")).toBe("open");
    expect(breaker.isRequestAllowed("hf")).toBe(false);

    expect(breaker.snapshot()).toEqual([
      {
        provider: "hf",
        state: "open",
        consecutiveFailures: DEFAULT_FAILURE_THRESHOLD,
        totalTrips: 1,
        totalSuccesses: 0,
        lastFailureKind: "rate_limit",
        openedAt: 1_000,
        openUntil: 1_000 + DEFAULT_PROVIDER_COOLDOWN_MS,
      },
    ]);
  });

  it("success resets the consecutive failure count", () => {
    const breaker = new CircuitBreaker();
    breaker.recordFailure("hf", failing("hf", "timeout"));
    breaker.recordFailure("hf", failing("hf", "timeout"));
    breaker.recordSuccess("hf");
    breaker.recordFailure("hf", failing("hf", "timeout"));
    breaker.recordFailure("hf", failing("hf", "timeout"));

    expect(breaker.state("hf")).toBe("closed");
    const [entry] = breaker.snapshot();
    expect(entry?.consecutiveFailures).toBe(2);
    expect(entry?.totalSuccesses).toBe(1);
    expect(entry?.totalTrips).toBe(0);
  });

  it("auto-recovers: cooldown elapsed → half-open probe → success closes", () => {
    const c = clock(0);
    const breaker = new CircuitBreaker({ now: c.now, cooldownMs: 20_000 });
    for (let i = 0; i < DEFAULT_FAILURE_THRESHOLD; i += 1) {
      breaker.recordFailure("hf", failing("hf", "provider_unavailable"));
    }
    expect(breaker.state("hf")).toBe("open");

    c.advance(20_000);
    expect(breaker.state("hf")).toBe("half-open");
    expect(breaker.isRequestAllowed("hf")).toBe(true); // probe window

    breaker.recordSuccess("hf");
    expect(breaker.state("hf")).toBe("closed");
    expect(breaker.healthMap()).toEqual({});
    expect(breaker.snapshot()[0]?.consecutiveFailures).toBe(0);
  });

  it("a failed half-open probe re-opens with a fresh cooldown", () => {
    const c = clock(0);
    const breaker = new CircuitBreaker({ now: c.now, cooldownMs: 20_000, failureThreshold: 1 });
    breaker.recordFailure("hf", failing("hf", "rate_limit"));
    expect(breaker.state("hf")).toBe("open");

    c.advance(20_000);
    expect(breaker.state("hf")).toBe("half-open");
    breaker.recordFailure("hf", failing("hf", "rate_limit"));

    expect(breaker.state("hf")).toBe("open");
    expect(c.read()).toBe(20_000);
    expect(breaker.snapshot()[0]?.openUntil).toBe(40_000);
    expect(breaker.snapshot()[0]?.totalTrips).toBe(2);
  });

  it("a server Retry-After hint longer than the base cooldown wins", () => {
    const c = clock(5_000);
    const breaker = new CircuitBreaker({ now: c.now, failureThreshold: 1, cooldownMs: 20_000 });
    breaker.recordFailure("hf", failing("hf", "rate_limit", 60_000));

    const [entry] = breaker.snapshot();
    expect(entry?.openedAt).toBe(5_000);
    expect(entry?.openUntil).toBe(65_000);
    c.advance(59_999);
    expect(breaker.state("hf")).toBe("open");
    c.advance(1);
    expect(breaker.state("hf")).toBe("half-open");
  });

  it("circuits are fully independent per provider", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure("hf", failing("hf", "provider_unavailable"));

    expect(breaker.state("hf")).toBe("open");
    expect(breaker.state("agnes")).toBe("closed");
    expect(breaker.isRequestAllowed("agnes")).toBe(true);
    expect(breaker.healthMap()).toEqual({ hf: "down" });
  });
});

describe("CircuitBreaker — what does NOT trip it", () => {
  it.each([
    "quota_exceeded",
    "auth",
    "invalid_request",
    "unknown",
  ] as ProviderErrorKind[])("kind %s is never a health event", (kind) => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure("hf", failing("hf", kind));
    breaker.recordFailure("hf", failing("hf", kind));

    expect(breaker.state("hf")).toBe("closed");
    // Not even tracked: key/request problems are not provider health.
    expect(breaker.snapshot()).toEqual([]);
  });

  it("every provider-health kind counts toward tripping", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    breaker.recordFailure("hf", failing("hf", "rate_limit"));
    breaker.recordFailure("hf", failing("hf", "provider_unavailable"));
    breaker.recordFailure("hf", failing("hf", "timeout"));
    expect(breaker.state("hf")).toBe("open");
    expect(breaker.snapshot()[0]?.lastFailureKind).toBe("timeout");
  });

  it("detection-less failures still count (defensive callers)", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    breaker.recordFailure("gemini");
    breaker.recordFailure("gemini");
    expect(breaker.state("gemini")).toBe("open");
  });
});

describe("CircuitBreaker — router + ops surface", () => {
  it("healthMap is a drop-in for C3's RouteContext.health", () => {
    const c = clock(0);
    const breaker = new CircuitBreaker({ now: c.now, failureThreshold: 1, cooldownMs: 20_000 });
    breaker.recordFailure("hf", failing("hf", "rate_limit"));
    breaker.recordFailure("agnes", failing("agnes", "provider_unavailable"));

    expect(breaker.healthMap()).toEqual({ hf: "down", agnes: "down" });
    c.advance(20_000);
    expect(breaker.healthMap()).toEqual({ hf: "degraded", agnes: "degraded" });
    breaker.recordSuccess("hf");
    expect(breaker.healthMap()).toEqual({ agnes: "degraded" });
  });

  it("reset closes one circuit; reset() closes them all", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure("hf", failing("hf", "rate_limit"));
    breaker.recordFailure("agnes", failing("agnes", "rate_limit"));
    expect(breaker.snapshot()).toHaveLength(2);

    breaker.reset("hf");
    expect(breaker.state("hf")).toBe("closed");
    expect(breaker.state("agnes")).toBe("open");

    breaker.reset();
    expect(breaker.snapshot()).toEqual([]);
  });

  it("snapshot ordering is deterministic", () => {
    const breaker = new CircuitBreaker();
    breaker.recordSuccess("pollinations");
    breaker.recordSuccess("hf");
    breaker.recordSuccess("agnes");
    expect(breaker.snapshot().map((e) => e.provider)).toEqual(["agnes", "hf", "pollinations"]);
  });
});

describe("D3 × D4 integration — route, blame, break, recover", () => {
  type Scripted = ImageProvider & { calls: number };
  function stubProvider(
    id: ProviderId,
    tier: ProviderTier,
    script: ReadonlyArray<ImageGenerateResult | Error>,
  ): Scripted {
    const stub: Scripted = {
      id,
      tier,
      keyless: id === "pollinations",
      calls: 0,
      isAvailable: () => true,
      healthCheck: async (): Promise<ProviderHealthReport> => ({
        provider: id,
        state: "up",
        latencyMs: 1,
        checkedAt: 0,
      }),
      generate: async (): Promise<ImageGenerateResult> => {
        const next = script[Math.min(stub.calls, script.length - 1)];
        stub.calls += 1;
        if (next instanceof Error) throw next;
        return next;
      },
    };
    return stub;
  }

  const endpoint = (id: ProviderId): ImageGenerateResult => ({
    imageUrl: `https://img.test/${id}.png`,
    provider: id,
    urlOnly: id === "pollinations",
    latencyMs: 5,
    keyRotations: 0,
  });

  const REQUEST: ImageGenerateRequest = { prompt: "neon city skyline", aspectRatio: "16:9" };
  const decide = (): RoutingDecision => ({
    sceneIndex: 0,
    complexity: "SIMPLE",
    providerId: "hf",
    providerTier: "free",
    reason: "complexity-match",
    fallbacks: ["pollinations"],
    decidedAt: 0,
  });

  it("a real breaker wired as observer + gate drives the whole lifecycle", async () => {
    const c = clock(0);
    const breaker = new CircuitBreaker({ now: c.now, failureThreshold: 2, cooldownMs: 20_000 });
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "rate_limit", "hf HTTP 429"),
      new NormalizedProviderError("hf", "rate_limit", "hf HTTP 429"),
      endpoint("hf"),
    ]);
    const pollinations = stubProvider("pollinations", "free", [endpoint("pollinations")]);
    const options = {
      providers: { hf, pollinations },
      observer: breaker,
      isAllowed: (p: ProviderId) => breaker.isRequestAllowed(p),
    } as const;

    // 1st cascade: hf 429 → blamed (1/2), pollinations takes over.
    const first = await executeWithFallback(decide(), REQUEST, options);
    expect(first.result.provider).toBe("pollinations");
    expect(first.result.isFallback).toBe(true);
    expect(breaker.state("hf")).toBe("closed");

    // 2nd cascade: hf 429 again → threshold hit → circuit opens.
    const second = await executeWithFallback(decide(), REQUEST, options);
    expect(second.result.provider).toBe("pollinations");
    expect(breaker.state("hf")).toBe("open");
    expect(breaker.healthMap()).toEqual({ hf: "down" });

    // 3rd cascade: gate skips hf entirely — silent overflow to pollinations.
    const third = await executeWithFallback(decide(), REQUEST, options);
    expect(third.hops[0]).toMatchObject({
      provider: "hf",
      outcome: "skipped",
      message: "circuit open",
    });
    expect(hf.calls).toBe(2); // no third attempt burned on an open circuit
    expect(third.result.provider).toBe("pollinations");

    // Recovery: cooldown elapses → half-open probe succeeds → closed.
    c.advance(20_000);
    const fourth = await executeWithFallback(decide(), REQUEST, options);
    expect(fourth.result).toMatchObject({
      status: "success",
      provider: "hf",
      isFallback: false,
    });
    expect(hf.calls).toBe(3);
    expect(breaker.state("hf")).toBe("closed");
    expect(breaker.snapshot()[0]).toMatchObject({
      provider: "hf",
      totalTrips: 1,
      consecutiveFailures: 0,
    });
  });
});
