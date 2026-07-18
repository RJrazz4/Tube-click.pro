import { describe, expect, it } from "vitest";

import { CostTracker } from "../cost/index.js";
import { GeneratorMetrics } from "../generator/index.js";
import type { AnalyzeResult } from "../manager/index.js";
import {
  NormalizedProviderError,
  type ImageGenerateRequest,
  type ImageGenerateResult,
  type ImageProvider,
  type ProviderHealthReport,
} from "../providers/index.js";
import { TierPolicy } from "../tiers/index.js";
import type {
  ProviderId,
  ProviderTier,
  ScenePlan,
  UserTier,
} from "../types/index.js";

import {
  handleStoryboard,
  type StoryboardHandlerDeps,
  type StoryboardPlanner,
  type StoryboardResponseBody,
} from "./storyboard-handler.js";
import type { ApiAuth, ApiErrorBody, RateLimitGate } from "./types.js";

/* ---------------------------------- fakes ---------------------------------- */

type Scripted = ImageProvider & { calls: number; requests: ImageGenerateRequest[] };

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
    requests: [],
    isAvailable: () => true,
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

function scene(index: number): ScenePlan {
  return {
    index,
    title: `Scene ${index}`,
    prompt: `prompt ${index}`,
    negativePrompt: "",
    complexity: "SIMPLE",
    aspectRatio: "16:9",
    routingHint: "auto",
  };
}

function plannerReturning(scenes: ScenePlan[]): StoryboardPlanner {
  return {
    analyzeScript: async (): Promise<AnalyzeResult> => ({
      output: { characterProfile: null, scenes },
      meta: { model: "test-brain", attempts: 1, complexityOverrides: 0, llmLatencyMs: 7 },
    }),
  };
}

const auth = (tier: UserTier, clientId = "client-1"): ApiAuth => ({ tier, clientId });

const SCRIPT = { script: "A reasonably long video script about mountain sunsets." };

function deps(
  providers: ReadonlyArray<ImageProvider>,
  overrides: Partial<StoryboardHandlerDeps> = {},
): StoryboardHandlerDeps {
  return {
    policy: new TierPolicy(),
    planner: plannerReturning([scene(0), scene(1), scene(2)]),
    providers,
    ...overrides,
  };
}

const denyGate: RateLimitGate = {
  check: () => ({
    allowed: false,
    limit: 10,
    remaining: 0,
    retryAfterSeconds: 6,
    resetAtSeconds: 1_800_000_000,
  }),
};

/* ---------------------------------- tests ---------------------------------- */

describe("handleStoryboard — happy path", () => {
  it("plans, generates, aggregates: 200 with the full snapshot", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const response = await handleStoryboard(SCRIPT, auth("free"), deps([hf]));

    expect(response.status).toBe(200);
    const body = response.body as StoryboardResponseBody;
    expect(body).toMatchObject({
      tier: "free",
      plannedScenes: 3,
      generatedScenes: 3,
      truncated: false,
      remainingScenes: 0,
      characterProfile: null,
    });
    expect(body.scenes.map((s) => s.sceneIndex)).toEqual([0, 1, 2]);
    expect(body.scenes.every((s) => s.status === "success")).toBe(true);
    expect(body.summary).toMatchObject({ total: 3, succeeded: 3, failed: 0 });
    expect(body.meta).toMatchObject({ model: "test-brain", attempts: 1 });
    expect(hf.calls).toBe(3);
  });

  it("feeds C4 tracker and E4 metrics through the E3 sink seam", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const tracker = new CostTracker();
    const metrics = new GeneratorMetrics();

    await handleStoryboard(SCRIPT, auth("free"), deps([hf], { tracker, metrics }));

    expect(tracker.summary().decisions.total).toBe(3);
    expect(tracker.summary().outcomes.succeeded).toBe(3);
    expect(metrics.snapshot()).toMatchObject({
      scenesProcessed: 3,
      imagesGenerated: 3,
      estimatedPremiumUnits: 0,
    });
  });

  it("per-scene seeds derive from the request seed (E2 fan-out)", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    await handleStoryboard({ ...SCRIPT, seed: 10 }, auth("free"), deps([hf]));
    expect(hf.requests.map((r) => r.seed)).toEqual([10, 11, 12]);
  });
});

describe("handleStoryboard — F2 truncation echo", () => {
  it("free tier: a 6-scene plan serves 4, truncated=true, remainingScenes=2", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const sixScenes = Array.from({ length: 6 }, (_, i) => scene(i));
    const response = await handleStoryboard(
      SCRIPT,
      auth("free"),
      deps([hf], { planner: plannerReturning(sixScenes) }),
    );

    expect(response.status).toBe(200);
    const body = response.body as StoryboardResponseBody;
    expect(body.plannedScenes).toBe(6);
    expect(body.generatedScenes).toBe(4);
    expect(body.truncated).toBe(true);
    expect(body.remainingScenes).toBe(2);
    expect(body.scenes).toHaveLength(4);
    expect(hf.calls).toBe(4); // capped scenes were never attempted
  });

  it("cinematic: a 12-scene plan is served in full", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const twelve = Array.from({ length: 12 }, (_, i) => scene(i));
    const response = await handleStoryboard(
      SCRIPT,
      auth("cinematic"),
      deps([hf], { planner: plannerReturning(twelve) }),
    );

    const body = response.body as StoryboardResponseBody;
    expect(body.truncated).toBe(false);
    expect(body.scenes).toHaveLength(12);
  });
});

describe("handleStoryboard — validation and failure surfaces", () => {
  it("invalid body → 400 with issue strings, planner never called", async () => {
    let plannerCalled = false;
    const planner: StoryboardPlanner = {
      analyzeScript: async () => {
        plannerCalled = true;
        return plannerReturning([]).analyzeScript("", { tier: "free" });
      },
    };
    const response = await handleStoryboard({}, auth("free"), deps([], { planner }));

    expect(response.status).toBe(400);
    const body = response.body as ApiErrorBody;
    expect(body.error.code).toBe("invalid_request");
    expect(String(body.error.details)).toContain("script");
    expect(plannerCalled).toBe(false);
  });

  it("planner failure → 503 planner_unavailable with a sanitized message", async () => {
    const planner: StoryboardPlanner = {
      analyzeScript: async () => {
        throw new Error("openrouter 402: insufficient credits for key sk-or-v1-secretcafe");
      },
    };
    const response = await handleStoryboard(SCRIPT, auth("free"), deps([], { planner }));

    expect(response.status).toBe(503);
    const body = response.body as ApiErrorBody;
    expect(body.error.code).toBe("planner_unavailable");
    expect(body.error.message).toContain("insufficient credits");
    expect(body.error.message).not.toContain("sk-or-v1-secretcafe");
  });

  it("zero providers → 200 with failed rows, not a crash (A3 contract held)", async () => {
    const response = await handleStoryboard(SCRIPT, auth("free"), deps([]));

    expect(response.status).toBe(200);
    const body = response.body as StoryboardResponseBody;
    expect(body.summary.failed).toBe(3);
    expect(body.scenes.every((s) => s.status === "failed")).toBe(true);
    expect(body.scenes[0]?.error).toContain("No image provider");
  });

  it("provider mid-flight failure appears as failed rows inside the 200", async () => {
    const hf = stubProvider("hf", "free", [
      new NormalizedProviderError("hf", "rate_limit", "hf HTTP 429"),
    ]);
    const response = await handleStoryboard(SCRIPT, auth("free"), deps([hf]));

    expect(response.status).toBe(200);
    const body = response.body as StoryboardResponseBody;
    expect(body.summary.failed).toBe(3);
  });
});

describe("handleStoryboard — F4 rate-limit seam", () => {
  it("denied gate → 429 + Retry-After before ANY work", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    let plannerCalls = 0;
    const planner: StoryboardPlanner = {
      analyzeScript: async (script, options) => {
        plannerCalls += 1;
        return plannerReturning([scene(0)]).analyzeScript(script, options);
      },
    };

    const response = await handleStoryboard(
      SCRIPT,
      auth("free"),
      deps([hf], { planner, rateLimiter: denyGate }),
    );

    expect(response.status).toBe(429);
    const body = response.body as ApiErrorBody;
    expect(body.error.code).toBe("rate_limit_exceeded");
    expect(response.headers).toMatchObject({
      "X-RateLimit-Limit": "10",
      "X-RateLimit-Remaining": "0",
      "Retry-After": "6",
    });
    expect(plannerCalls).toBe(0);
    expect(hf.calls).toBe(0);
  });

  it("allowed gate → rate-limit headers ride the 200 response", async () => {
    const allowGate: RateLimitGate = {
      check: () => ({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAtSeconds: 1_800_000_060,
      }),
    };
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const response = await handleStoryboard(
      SCRIPT,
      auth("pro"),
      deps([hf], { rateLimiter: allowGate }),
    );

    expect(response.status).toBe(200);
    expect(response.headers).toMatchObject({
      "X-RateLimit-Limit": "10",
      "X-RateLimit-Remaining": "9",
      "X-RateLimit-Reset": "1800000060",
    });
    expect(response.headers?.["Retry-After"]).toBeUndefined();
  });
});
