import { describe, expect, it } from "vitest";

import { CostTracker } from "../cost/index.js";
import {
  NormalizedProviderError,
  type ImageGenerateRequest,
  type ImageGenerateResult,
  type ImageProvider,
  type ProviderHealthReport,
} from "../providers/index.js";
import { CircuitBreaker } from "../resilience/index.js";
import type {
  ProviderId,
  ProviderTier,
  ScenePlan,
} from "../types/index.js";

import { GeneratorAgent } from "./generator-agent.js";
import {
  createSceneRunner,
  generateScene,
  mapSceneError,
  sceneToRequest,
  type ScenePipelineContext,
} from "./scene-pipeline.js";

type Scripted = ImageProvider & { calls: number; requests: ImageGenerateRequest[] };

/** Wraps a non-Error value so the stub can THROW it (adapters can throw anything). */
class ThrownValue {
  constructor(readonly value: unknown) {}
}
const thrown = (value: unknown): ThrownValue => new ThrownValue(value);

function stubProvider(
  id: ProviderId,
  tier: ProviderTier,
  script: ReadonlyArray<ImageGenerateResult | Error | ThrownValue>,
  available = true,
): Scripted {
  const stub: Scripted = {
    id,
    tier,
    keyless: id === "pollinations",
    calls: 0,
    requests: [],
    isAvailable: () => available,
    healthCheck: async (): Promise<ProviderHealthReport> => ({
      provider: id,
      state: "up",
      latencyMs: 1,
      checkedAt: 0,
    }),
    generate: async (request): Promise<ImageGenerateResult> => {
      stub.requests.push(request);
      const next = script[Math.min(stub.calls, script.length - 1)];
      stub.calls += 1;
      if (next instanceof ThrownValue) throw next.value;
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

function makeScene(overrides: Partial<ScenePlan> = {}): ScenePlan {
  return {
    index: 2,
    title: "Sunset",
    prompt: "a sunset over mountains",
    negativePrompt: "blurry, text",
    complexity: "SIMPLE",
    aspectRatio: "16:9",
    routingHint: "auto",
    ...overrides,
  };
}

const ctx = (
  tier: ScenePipelineContext["tier"],
  providers: ReadonlyArray<ImageProvider>,
  overrides: Partial<ScenePipelineContext> = {},
): ScenePipelineContext => ({ tier, providers, ...overrides });

describe("generateScene — the full C3 → D3 → D4 chain", () => {
  it("routes, executes, and returns a success result; tracker saw the decision", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const pollinations = stubProvider("pollinations", "free", [endpoint("pollinations")]);
    const tracker = new CostTracker();

    const result = await generateScene(
      makeScene(),
      ctx("free", [hf, pollinations], { tracker }),
    );

    expect(result).toMatchObject({
      sceneIndex: 2,
      status: "success",
      imageUrl: "https://img.test/hf.png",
      provider: "hf",
      costTier: "free",
      isFallback: false,
      attempts: 1,
    });
    expect(tracker.summary().decisions.total).toBe(1);
    expect(tracker.summary().decisions.byReason["complexity-match"]).toBe(1);
  });

  it("builds the provider request from the scene (seed fanned out by index)", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const controller = new AbortController();

    await generateScene(
      makeScene({ index: 2 }),
      ctx("free", [hf], { seed: 100, signal: controller.signal }),
    );

    expect(hf.requests).toHaveLength(1);
    expect(hf.requests[0]).toMatchObject({
      prompt: "a sunset over mountains",
      negativePrompt: "blurry, text",
      aspectRatio: "16:9",
      seed: 102, // 100 + scene.index — deterministic, per-scene distinct
      requestTag: "scene-2",
    });
    expect(hf.requests[0]?.signal).toBe(controller.signal);
  });

  it("sceneToRequest omits empty negatives and undefined seeds", () => {
    const request = sceneToRequest(makeScene({ negativePrompt: "" }));
    expect(request.negativePrompt).toBeUndefined();
    expect(request.seed).toBeUndefined();
    expect(request.signal).toBeUndefined();
  });
});

describe("generateScene — never throws (A3 contract)", () => {
  it("no usable providers → failed result with attempts 0, not a crash", async () => {
    const result = await generateScene(makeScene(), ctx("free", []));

    expect(result).toMatchObject({
      sceneIndex: 2,
      status: "failed",
      isFallback: false,
      attempts: 0,
      keyRotations: 0,
    });
    expect(result.error).toContain("No image provider available");
  });

  it("garbage thrown by an adapter becomes a sanitized failed result", async () => {
    const hf = stubProvider("hf", "free", [thrown(42)]); // not even an Error
    const result = await generateScene(makeScene(), ctx("free", [hf]));

    expect(result.status).toBe("failed");
    expect(result.error).toContain("aborted at hf");
  });

  it("chain exhaustion surfaces a failed result with the last provider", async () => {
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "rate_limit", "hf HTTP 429"),
    ]);
    const pollinations = stubProvider("pollinations", "free", [
      new NormalizedProviderError("pollinations", "timeout", "pollinations timeout"),
    ]);

    const result = await generateScene(makeScene(), ctx("free", [hf, pollinations]));

    expect(result).toMatchObject({
      status: "failed",
      provider: "pollinations",
      isFallback: true,
      attempts: 2,
    });
  });
});

describe("generateScene — breaker as live health, observer, and gate", () => {
  it("an open breaker steers routing pre-decision (reason: provider-health)", async () => {
    const agnes = stubProvider("agnes", "premium", [endpoint("agnes")]);
    const gemini = stubProvider("gemini", "premium", [endpoint("gemini")]);
    const pollinations = stubProvider("pollinations", "free", [endpoint("pollinations")]);
    const tracker = new CostTracker();
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure("agnes"); // open before the pipeline even runs

    const result = await generateScene(
      makeScene({ complexity: "COMPLEX" }),
      ctx("pro", [agnes, gemini, pollinations], { breaker, tracker }),
    );

    // The natural primary (agnes) was evicted by health before any attempt.
    expect(result).toMatchObject({
      status: "success",
      provider: "gemini",
      isFallback: false,
      attempts: 1,
    });
    expect(agnes.calls).toBe(0); // never touched
    expect(tracker.decisions()[0]?.reason).toBe("provider-health");
  });

  it("with every keyed provider down, the ultimate sink is primary (reason: pollinations-ultimate)", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const pollinations = stubProvider("pollinations", "free", [endpoint("pollinations")]);
    const tracker = new CostTracker();
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    breaker.recordFailure("hf");

    const result = await generateScene(
      makeScene(),
      ctx("free", [hf, pollinations], { breaker, tracker }),
    );

    // Pollinations was the decision's PRIMARY — so this is not a fallback.
    expect(result).toMatchObject({
      status: "success",
      provider: "pollinations",
      isFallback: false,
      attempts: 1,
    });
    expect(hf.calls).toBe(0); // never touched
    expect(tracker.decisions()[0]?.reason).toBe("pollinations-ultimate");
  });

  it("a mid-flight 429 blames the breaker and cascades to pollinations", async () => {
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "rate_limit", "hf HTTP 429"),
    ]);
    const pollinations = stubProvider("pollinations", "free", [endpoint("pollinations")]);
    const breaker = new CircuitBreaker({ failureThreshold: 2 });

    const result = await generateScene(
      makeScene(),
      ctx("free", [hf, pollinations], { breaker }),
    );

    expect(result).toMatchObject({
      status: "success",
      provider: "pollinations",
      isFallback: true,
    });
    expect(breaker.snapshot()[0]).toMatchObject({
      provider: "hf",
      consecutiveFailures: 1,
      state: "closed",
    });
  });

  it("a circuit opening between decision and execution skips via the gate", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const pollinations = stubProvider("pollinations", "free", [endpoint("pollinations")]);
    const breaker = new CircuitBreaker({ failureThreshold: 1 });

    const result = await generateScene(
      makeScene(),
      ctx("free", [hf, pollinations], {
        breaker,
        // Flip hf's circuit open exactly when routing finishes.
        tracker: {
          record: () => breaker.recordFailure("hf"),
        },
      }),
    );

    expect(result).toMatchObject({ status: "success", provider: "pollinations" });
    expect(hf.calls).toBe(0);
  });
});

describe("E1 × E2 — storyboard batch composition", () => {
  it("fans scenes out through the agent, one ordered result per scene", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const pollinations = stubProvider("pollinations", "free", [endpoint("pollinations")]);
    const tracker = new CostTracker();
    const agent = new GeneratorAgent(); // plan default: concurrency 3
    const scenes = Array.from({ length: 6 }, (_, index) =>
      makeScene({ index, title: `Scene ${index}` }),
    );

    const results = await agent.generateBatch(
      scenes,
      createSceneRunner(ctx("free", [hf, pollinations], { tracker })),
      { mapError: mapSceneError },
    );

    expect(results).toHaveLength(6);
    expect(results.map((r) => r.sceneIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(results.every((r) => r.status === "success")).toBe(true);
    expect(tracker.summary().decisions.total).toBe(6);
    expect(hf.calls).toBe(6);
  });

  it("mapSceneError fabricates a compliant failed slot for pipeline crashes", () => {
    const failed = mapSceneError(new Error("programmer typo"), makeScene({ index: 7 }));
    expect(failed).toMatchObject({
      sceneIndex: 7,
      status: "failed",
      attempts: 0,
      isFallback: false,
    });
    expect(failed.error).toContain("pipeline error");
    expect(failed.error).toContain("programmer typo");
  });
});
