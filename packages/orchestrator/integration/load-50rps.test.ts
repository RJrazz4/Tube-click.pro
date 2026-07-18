/**
 * Phase H4 — 50 RPS load behavior.
 *
 * Sustained concurrent pressure through the mounted API surface (the
 * same handlers a 10k-user deployment runs), proving:
 *
 *   - every request RESOLVES (no hang, no crash, no lost scenes)
 *   - accounting stays EXACT under concurrency (metrics/tracker counts)
 *   - the F4 token bucket enforces tier limits deterministically mid-burst
 *   - upstream 429 storms under load still degrade silently to the
 *     URL-only pollinations lane (H3's property, now at 50 RPS)
 *
 * All work is URL-only/mocked — the point is orchestration behavior,
 * so generous wall-clock bounds assert "near-instant", not "eventually".
 */
import { describe, expect, it } from "vitest";

import { parseEnv } from "../../shared/env/index.js";
import { createOrchestratorApi } from "../api/composition-root.js";
import type {
  StoryboardPlanner,
  StoryboardResponseBody,
} from "../api/storyboard-handler.js";
import type { ThumbnailsResponseBody } from "../api/thumbnails-handler.js";
import { TierRateLimiter } from "../api/rate-limiter.js";
import type {
  ApiAuth,
  ApiErrorBody,
  ApiResponse,
} from "../api/types.js";
import type { AnalyzeResult } from "../manager/index.js";
import type { ScenePlan } from "../types/index.js";

const FIXED_NOW = 1_800_000_000_000;
const now = () => FIXED_NOW;

const RPS_WAVE = 50;
/** Absurdly generous ceiling — real runs land in tens of milliseconds. */
const WAVE_TIME_BUDGET_MS = 5_000;

function makeEnv(overrides: Record<string, string> = {}) {
  return parseEnv({
    IMAGE_API_KEYS: "",
    OPENROUTER_API_KEYS: "",
    POLLINATIONS_ENABLED: "true",
    ...overrides,
  });
}

function scene(index: number, complexity: ScenePlan["complexity"]): ScenePlan {
  return {
    index,
    title: `Load scene ${index}`,
    prompt: `load scene ${index}`,
    negativePrompt: "",
    complexity,
    aspectRatio: "16:9",
    routingHint: "auto",
  };
}

function plannerWith(
  count: number,
  complexity: ScenePlan["complexity"] = "SIMPLE",
): StoryboardPlanner {
  return {
    analyzeScript: async (): Promise<AnalyzeResult> => ({
      output: {
        characterProfile: null,
        scenes: Array.from({ length: count }, (_, i) => scene(i, complexity)),
      },
      meta: { model: "stub", attempts: 1, complexityOverrides: 0, llmLatencyMs: 1 },
    }),
  };
}

const SCRIPT = { script: "A load-test script long enough to pass validation." };
const SCENES_PER_STORYBOARD = 3;

const failFetch: typeof fetch = (() => {
  throw new Error("load test must never hit the network");
}) as typeof fetch;

function sceneBodies(responses: ApiResponse[]): StoryboardResponseBody[] {
  return responses.map((r) => r.body as StoryboardResponseBody);
}

describe("H4 — 50 RPS load behavior", () => {
  it("50 concurrent storyboards all resolve; accounting is EXACT; zero network", async () => {
    const api = createOrchestratorApi(makeEnv(), {
      fetchImpl: failFetch,
      planner: plannerWith(SCENES_PER_STORYBOARD),
      rateLimiter: new TierRateLimiter({ now }),
      now,
    });

    const started = Date.now();
    const responses = await Promise.all(
      Array.from({ length: RPS_WAVE }, (_, i) =>
        api.handleStoryboard(SCRIPT, { tier: "cinematic", clientId: `wave-user-${i}` }),
      ),
    );
    const elapsed = Date.now() - started;

    for (const [i, response] of responses.entries()) {
      expect(response.status, `request ${i}`).toBe(200);
      expect(response.headers?.["X-RateLimit-Limit"]).toBeDefined();
    }
    for (const body of sceneBodies(responses)) {
      expect(body.summary).toMatchObject({
        total: SCENES_PER_STORYBOARD,
        succeeded: SCENES_PER_STORYBOARD,
        failed: 0,
      });
    }

    // Exact concurrency accounting — no lost or double-counted scenes.
    const expectedScenes = RPS_WAVE * SCENES_PER_STORYBOARD;
    expect(api.metrics.snapshot().scenesProcessed).toBe(expectedScenes);
    expect(api.metrics.snapshot().imagesGenerated).toBe(expectedScenes);
    expect(api.tracker.summary().outcomes.recorded).toBe(expectedScenes);
    expect(elapsed).toBeLessThan(WAVE_TIME_BUDGET_MS);
  });

  it("one hot client mid-burst: the token bucket allows exactly its capacity", async () => {
    const api = createOrchestratorApi(makeEnv(), {
      fetchImpl: failFetch,
      planner: plannerWith(SCENES_PER_STORYBOARD),
      // Frozen clock: no refill mid-burst — the assertion is exact.
      rateLimiter: new TierRateLimiter({ now }),
      now,
    });

    // Free tier rule: burst capacity 10 (F4 DEFAULT_TIER_RULES).
    const responses = await Promise.all(
      Array.from({ length: RPS_WAVE }, () =>
        api.handleStoryboard(SCRIPT, { tier: "free", clientId: "hot-client" }),
      ),
    );

    const allowed = responses.filter((r) => r.status === 200);
    const denied = responses.filter((r) => r.status === 429);
    expect(allowed.length).toBe(10);
    expect(denied.length).toBe(RPS_WAVE - 10);
    for (const response of denied) {
      const body = response.body as ApiErrorBody;
      expect(body.error.code).toBe("rate_limit_exceeded");
      expect(response.headers?.["Retry-After"]).toBeDefined();
      expect(response.headers?.["X-RateLimit-Remaining"]).toBe("0");
    }
    // Denied requests ran ZERO expensive work (gate fires before planner).
    expect(api.metrics.snapshot().scenesProcessed).toBe(10 * SCENES_PER_STORYBOARD);
  });

  it("three 50-RPS waves of thumbnails: sustained honest inventory, no drift", async () => {
    const api = createOrchestratorApi(makeEnv(), {
      fetchImpl: failFetch,
      planner: plannerWith(1),
      now,
    });

    const started = Date.now();
    for (let wave = 0; wave < 3; wave += 1) {
      const responses = await Promise.all(
        Array.from({ length: RPS_WAVE }, (_, i) =>
          api.handleThumbnails(
            { prompt: `wave ${wave} thumbnail ${i}`, count: 2 },
            { tier: "pro", clientId: `thumb-${wave}-${i}` },
          ),
        ),
      );
      for (const response of responses) {
        expect(response.status).toBe(200);
        const body = response.body as ThumbnailsResponseBody;
        expect(body.summary).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
        for (const thumb of body.thumbnails) {
          expect(thumb.imageUrl).toContain("image.pollinations.ai/prompt/");
        }
      }
      // Wave gap: the event loop stays responsive between bursts.
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const elapsed = Date.now() - started;

    const snapshot = api.metrics.snapshot();
    expect(snapshot.imagesGenerated).toBe(3 * RPS_WAVE * 2);
    expect(snapshot.imagesFailed).toBe(0);
    expect(snapshot.latency.p99Ms).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(3 * WAVE_TIME_BUDGET_MS);
  });

  it("50 RPS THROUGH an upstream 429 storm: wave 1 trips breakers, wave 2 fetches nothing", async () => {
    const calls: string[] = [];
    const storm429 = ((input: unknown) => {
      calls.push(String(input));
      return Promise.resolve(
        new Response("slow down", {
          status: 429,
          headers: { "retry-after": "120" },
        }),
      );
    }) as typeof fetch;

    const api = createOrchestratorApi(
      makeEnv({ IMAGE_API_KEYS: "agnes:ak1,ak2;gemini:gk1;hf:hk1" }),
      {
        fetchImpl: storm429,
        // COMPLEX on cinematic → premium chain first (agnes → gemini → hf).
        planner: plannerWith(SCENES_PER_STORYBOARD, "COMPLEX"),
        now,
      },
    );

    // Wave 1: 50 concurrent cinematic storyboards straight into the storm.
    const wave1 = await Promise.all(
      Array.from({ length: RPS_WAVE }, (_, i) =>
        api.handleStoryboard(SCRIPT, { tier: "cinematic", clientId: `storm-user-${i}` }),
      ),
    );
    for (const body of sceneBodies(wave1)) {
      expect(body.summary.failed).toBe(0);
      expect(body.scenes.every((row) => row.provider === "pollinations")).toBe(true);
    }
    const callsAfterWave1 = calls.length;
    expect(callsAfterWave1).toBeGreaterThan(0);
    // Bounded even in the worst interleaving: 150 scenes × 4 slot attempts.
    expect(callsAfterWave1).toBeLessThanOrEqual(RPS_WAVE * SCENES_PER_STORYBOARD * 4);
    // The storm tripped every keyed circuit (failures are consecutive by
    // construction — nothing but 429s exist in this universe).
    expect(api.breaker.healthMap().agnes).toBe("down");
    expect(api.breaker.healthMap().gemini).toBe("down");
    expect(api.breaker.healthMap().hf).toBe("down");

    // Wave 2: same pressure — and the upstream is now completely silent.
    const started = Date.now();
    const wave2 = await Promise.all(
      Array.from({ length: RPS_WAVE }, (_, i) =>
        api.handleStoryboard(SCRIPT, { tier: "cinematic", clientId: `storm-user-2-${i}` }),
      ),
    );
    const elapsed = Date.now() - started;
    for (const body of sceneBodies(wave2)) {
      expect(body.summary).toMatchObject({ total: 3, succeeded: 3, failed: 0 });
    }
    expect(calls.length).toBe(callsAfterWave1);
    expect(api.metrics.snapshot().imagesGenerated).toBe(2 * RPS_WAVE * SCENES_PER_STORYBOARD);
    expect(elapsed).toBeLessThan(WAVE_TIME_BUDGET_MS);
  });
});
