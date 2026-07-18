import { describe, expect, it } from "vitest";

import {
  NormalizedProviderError,
  QueueOverflowError,
  type ImageGenerateRequest,
  type ImageGenerateResult,
  type ImageProvider,
  type ProviderHealthReport,
} from "../providers/index.js";
import type {
  ProviderId,
  ProviderTier,
  RoutingDecision,
} from "../types/index.js";

import { detect, type Detection } from "./detector.js";
import {
  executeWithFallback,
  type AttemptObserver,
  type FallbackHop,
} from "./fallback-executor.js";

type Scripted = ImageProvider & { calls: number };

/** Minimal ImageProvider double: replays a script of results/errors. */
function stubProvider(
  id: ProviderId,
  tier: ProviderTier,
  script: ReadonlyArray<ImageGenerateResult | Error>,
  available = true,
): Scripted {
  const stub: Scripted = {
    id,
    tier,
    keyless: id === "pollinations",
    calls: 0,
    isAvailable: () => available,
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

const ok = (id: ProviderId, keyRotations = 0): ImageGenerateResult => ({
  imageUrl: `https://img.test/${id}.png`,
  provider: id,
  urlOnly: id === "pollinations",
  latencyMs: 5,
  keyRotations,
});

const REQUEST: ImageGenerateRequest = {
  prompt: "a sunset over mountains",
  aspectRatio: "16:9",
};

function decision(primary: ProviderId, fallbacks: ProviderId[] = []): RoutingDecision {
  return {
    sceneIndex: 3,
    complexity: "SIMPLE",
    providerId: primary,
    providerTier: "free",
    reason: "complexity-match",
    fallbacks,
    decidedAt: 0,
  };
}

function observerSpy(): AttemptObserver & {
  successes: ProviderId[];
  failures: Array<{ provider: ProviderId; detection: Detection }>;
} {
  const spy: AttemptObserver & {
    successes: ProviderId[];
    failures: Array<{ provider: ProviderId; detection: Detection }>;
  } = {
    successes: [],
    failures: [],
    recordSuccess(provider) {
      spy.successes.push(provider);
    },
    recordFailure(provider, detection) {
      spy.failures.push({ provider, detection });
    },
  };
  return spy;
}

describe("executeWithFallback — happy path", () => {
  it("primary success: one hop, no fallback, adapter rotations preserved", async () => {
    const hf = stubProvider("hf", "free", [ok("hf", 1)]);
    const exec = await executeWithFallback(decision("hf"), REQUEST, {
      providers: { hf },
    });

    expect(exec.result).toMatchObject({
      status: "success",
      imageUrl: "https://img.test/hf.png",
      provider: "hf",
      costTier: "free",
      isFallback: false,
      attempts: 1,
      keyRotations: 1,
    });
    expect(exec.hops).toHaveLength(1);
    expect(exec.hops[0]).toMatchObject({ provider: "hf", position: 0, outcome: "success" });
  });

  it("passes premium costTier through from the adapter", async () => {
    const agnes = stubProvider("agnes", "premium", [ok("agnes")]);
    const exec = await executeWithFallback(decision("agnes"), REQUEST, {
      providers: { agnes },
    });
    expect(exec.result.costTier).toBe("premium");
  });

  it("measures positive wall latency with an injected clock", async () => {
    let t = 0;
    const hf = stubProvider("hf", "free", [ok("hf")]);
    const exec = await executeWithFallback(decision("hf"), REQUEST, {
      providers: { hf },
      now: () => (t += 5),
    });
    expect(exec.result.latencyMs).toBeGreaterThan(0);
  });
});

describe("executeWithFallback — verdict-driven cascade", () => {
  it("cooldown-provider: blames the observer and hops to the fallback", async () => {
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "rate_limit", "hf HTTP 429", { retryAfterMs: 1_000 }),
    ]);
    const agnes = stubProvider("agnes", "premium", [ok("agnes")]);
    const observer = observerSpy();

    const exec = await executeWithFallback(decision("hf", ["agnes"]), REQUEST, {
      providers: { hf, agnes },
      observer,
    });

    expect(exec.result).toMatchObject({
      status: "success",
      provider: "agnes",
      costTier: "premium",
      isFallback: true,
      attempts: 2,
    });
    expect(observer.failures).toHaveLength(1);
    expect(observer.failures[0]?.provider).toBe("hf");
    expect(observer.failures[0]?.detection.action).toBe("cooldown-provider");
    expect(observer.failures[0]?.detection.retryAfterMs).toBe(1_000);
    expect(observer.successes).toEqual(["agnes"]);
    expect(exec.hops.map((h) => h.outcome)).toEqual(["failure", "success"]);
    expect(exec.hops[0]?.action).toBe("cooldown-provider");
    expect(exec.hops[0]?.kind).toBe("rate_limit");
  });

  it("QueueOverflowError → next-provider WITHOUT blame — the 10k silent overflow", async () => {
    const hf = stubProvider("hf", "free", [
      new QueueOverflowError("hf", "saturated (2 in flight, 100 waiting)"),
    ]);
    const pollinations = stubProvider("pollinations", "free", [ok("pollinations")]);
    const observer = observerSpy();

    const exec = await executeWithFallback(decision("hf", ["pollinations"]), REQUEST, {
      providers: { hf, pollinations },
      observer,
    });

    expect(exec.result).toMatchObject({
      status: "success",
      provider: "pollinations",
      costTier: "free",
      isFallback: true,
    });
    // Queue saturation is local, NOT provider health: zero blame recorded.
    expect(observer.failures).toHaveLength(0);
    expect(observer.successes).toEqual(["pollinations"]);
    expect(exec.hops[0]).toMatchObject({ outcome: "failure", action: "next-provider" });
  });

  it("abort: stops the cascade immediately, fallbacks are never tried", async () => {
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "invalid_request", "hf HTTP 400: bad prompt"),
    ]);
    const agnes = stubProvider("agnes", "premium", [ok("agnes")]);

    const exec = await executeWithFallback(decision("hf", ["agnes"]), REQUEST, {
      providers: { hf, agnes },
    });

    expect(exec.result).toMatchObject({
      status: "failed",
      provider: "hf",
      costTier: "free",
      isFallback: false,
      attempts: 1,
    });
    expect(exec.result.error).toContain("aborted at hf");
    expect(exec.result.error).toContain("invalid_request");
    expect(agnes.calls).toBe(0);
    expect(exec.hops).toHaveLength(1);
  });

  it("chain exhausted: failed result aggregates attempts, last provider, sanitized summary", async () => {
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "rate_limit", "hf HTTP 429"),
    ]);
    const agnes = stubProvider("agnes", "premium", [
      new NormalizedProviderError("agnes", "provider_unavailable", "agnes HTTP 503"),
    ]);
    const pollinations = stubProvider("pollinations", "free", [
      new NormalizedProviderError("pollinations", "timeout", "pollinations timeout"),
    ]);

    const exec = await executeWithFallback(
      decision("hf", ["agnes", "pollinations"]),
      REQUEST,
      { providers: { hf, agnes, pollinations } },
    );

    expect(exec.result).toMatchObject({
      status: "failed",
      provider: "pollinations",
      costTier: "free",
      isFallback: true,
      attempts: 3,
    });
    expect(exec.result.error).toContain("all 3 attempt(s) across 3 provider(s) failed");
    expect(exec.result.error).toContain("pollinations timeout");
    expect(exec.hops.map((h) => h.provider)).toEqual(["hf", "agnes", "pollinations"]);
  });

  it("never leaks key material into the failure summary", async () => {
    const hf = stubProvider("hf", "free", [
      new Error("auth failed for sk-or-v1-deadbeefcafe using key=live_987654"),
    ]);

    const exec = await executeWithFallback(decision("hf"), REQUEST, {
      providers: { hf },
    });

    expect(exec.result.status).toBe("failed");
    expect(exec.result.error).not.toContain("sk-or-v1-deadbeefcafe");
    expect(exec.result.error).not.toContain("live_987654");
    expect(exec.hops[0]?.message).not.toContain("sk-or-v1-deadbeefcafe");
  });
});

describe("executeWithFallback — rotate-key verdicts (injected detector)", () => {
  /** First n detections become rotate-key; the rest delegate to real D2. */
  function rotatingDetect(n: number): (err: unknown, provider: ProviderId) => Detection {
    let seen = 0;
    return (err, provider) => {
      seen += 1;
      if (seen <= n) {
        return {
          kind: "rate_limit",
          action: "rotate-key",
          source: "vendor-signature",
          message: `rotation ${seen}`,
        };
      }
      return detect(err, provider);
    };
  }

  it("rotate-key retries the same provider in place, counting rotations", async () => {
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "rate_limit", "429"),
      ok("hf"),
    ]);

    const exec = await executeWithFallback(decision("hf"), REQUEST, {
      providers: { hf },
      detect: rotatingDetect(1),
    });

    expect(exec.result).toMatchObject({
      status: "success",
      provider: "hf",
      isFallback: false,
      attempts: 2,
      keyRotations: 1,
    });
    expect(hf.calls).toBe(2);
    expect(exec.hops.map((h) => h.outcome)).toEqual(["failure", "success"]);
    expect(exec.hops[0]?.action).toBe("rotate-key");
  });

  it("rotation budget exhausted → hops on without observer blame", async () => {
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "rate_limit", "429"),
      new NormalizedProviderError("hf", "rate_limit", "429"),
    ]);
    const pollinations = stubProvider("pollinations", "free", [ok("pollinations")]);
    const observer = observerSpy();

    const exec = await executeWithFallback(decision("hf", ["pollinations"]), REQUEST, {
      providers: { hf, pollinations },
      detect: rotatingDetect(2),
      observer,
    });

    expect(exec.result).toMatchObject({
      status: "success",
      provider: "pollinations",
      isFallback: true,
      attempts: 3,
      keyRotations: 1,
    });
    expect(hf.calls).toBe(2); // initial + one allowed rotation
    expect(observer.failures).toHaveLength(0); // key-level blame ≠ provider blame
  });
});

describe("executeWithFallback — chain hygiene", () => {
  it("skips unregistered, unavailable, and circuit-blocked hops without burning attempts", async () => {
    const hf = stubProvider("hf", "free", [ok("hf")]);
    const gemini = stubProvider("gemini", "premium", [ok("gemini")], false);
    const pollinations = stubProvider("pollinations", "free", [ok("pollinations")]);

    const exec = await executeWithFallback(
      decision("hf", ["agnes", "gemini", "pollinations"]),
      REQUEST,
      {
        providers: { hf, gemini, pollinations }, // "agnes" not registered
        isAllowed: (p) => p !== "hf", // breaker says hf is open
      },
    );

    expect(exec.result).toMatchObject({
      status: "success",
      provider: "pollinations",
      isFallback: true,
      attempts: 1, // only the pollinations attempt actually fired
    });
    expect(hf.calls).toBe(0);
    expect(exec.hops.map((h) => h.outcome)).toEqual([
      "skipped",
      "skipped",
      "skipped",
      "success",
    ]);
    expect(exec.hops[0]?.message).toBe("circuit open");
    expect(exec.hops[1]?.message).toBe("provider not registered");
    expect(exec.hops[2]?.message).toBe("provider not available");
  });

  it("all hops skipped → honest failed result with zero attempts", async () => {
    const exec = await executeWithFallback(decision("hf"), REQUEST, {
      providers: {}, // nothing registered at all
    });

    expect(exec.result).toMatchObject({
      status: "failed",
      isFallback: false,
      attempts: 0,
    });
    expect(exec.result.provider).toBeUndefined();
    expect(exec.result.costTier).toBeUndefined();
    expect(exec.result.error).toContain("no routed provider could be attempted");
  });

  it("works from a ReadonlyMap registry as well as a record", async () => {
    const hf = stubProvider("hf", "free", [ok("hf")]);
    const exec = await executeWithFallback(decision("hf"), REQUEST, {
      providers: new Map<ProviderId, ImageProvider>([["hf", hf]]),
    });
    expect(exec.result.status).toBe("success");
  });

  it("streams every hop through onHop in order", async () => {
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "rate_limit", "429"),
    ]);
    const pollinations = stubProvider("pollinations", "free", [ok("pollinations")]);
    const streamed: FallbackHop[] = [];

    const exec = await executeWithFallback(decision("hf", ["pollinations"]), REQUEST, {
      providers: { hf, pollinations },
      onHop: (hop) => streamed.push(hop),
    });

    expect(streamed).toEqual([...exec.hops]);
    expect(streamed).toHaveLength(2);
  });
});

describe("executeWithFallback — Phase 1 Primary Retry & Promptsmith Resilience", () => {
  it("retries primary provider on transient failure with promptsmith optimization before falling back", async () => {
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "rate_limit", "429 rate limit"),
      ok("hf"),
    ]);
    const pollinations = stubProvider("pollinations", "free", [ok("pollinations")]);

    let optimizedPromptReceived = "";
    const promptsmith = {
      async optimize(req: { rawInput: string }) {
        optimizedPromptReceived = req.rawInput;
        return {
          spec: {
            subject: "optimized subject",
            style: "cinematic",
            camera: "wide",
            negativePrompts: "blurry",
            rawPrompt: "optimized subject, cinematic, wide",
          },
          model: "test-model",
          attempts: 1,
          latencyMs: 5,
        };
      },
    };

    const exec = await executeWithFallback(decision("hf", ["pollinations"]), REQUEST, {
      providers: { hf, pollinations },
      maxPrimaryRetries: 1,
      promptsmith,
    });

    expect(exec.result.status).toBe("success");
    expect(exec.result.provider).toBe("hf");
    expect(exec.result.isFallback).toBe(false);
    expect(hf.calls).toBe(2);
    expect(pollinations.calls).toBe(0);
    expect(exec.hops).toHaveLength(2); // failure on primary, success on retry primary
    expect(exec.hops[0]?.outcome).toBe("failure");
    expect(exec.hops[1]?.outcome).toBe("success");
  });
});
