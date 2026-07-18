import { describe, expect, it } from "vitest";

import { parseEnv } from "../../shared/env/index.js";
import type { AnalyzeResult } from "../manager/index.js";
import type { ScenePlan } from "../types/index.js";

import { createOrchestratorApi, DEFAULT_LANE_LIMITS } from "./composition-root.js";
import type { StoryboardPlanner } from "./storyboard-handler.js";
import type { StoryboardResponseBody } from "./storyboard-handler.js";
import type { ApiErrorBody, ApiAuth } from "./types.js";
import type { TiersResponseBody } from "./tiers-handler.js";
import type { ThumbnailsResponseBody } from "./thumbnails-handler.js";

const auth = (tier: ApiAuth["tier"]): ApiAuth => ({ tier, clientId: "root-test" });

/** Minimal valid AppEnv; pools empty unless stated, pollinations on. */
function makeEnv(overrides: Record<string, string> = {}) {
  return parseEnv({
    IMAGE_API_KEYS: "",
    OPENROUTER_API_KEYS: "",
    POLLINATIONS_ENABLED: "true",
    ...overrides,
  });
}

function scene(index: number): ScenePlan {
  return {
    index,
    title: `Scene ${index}`,
    prompt: `a scene about ${index}`,
    negativePrompt: "",
    complexity: "SIMPLE",
    aspectRatio: "16:9",
    routingHint: "auto",
  };
}

function plannerWith(count: number): StoryboardPlanner {
  return {
    analyzeScript: async (): Promise<AnalyzeResult> => ({
      output: {
        characterProfile: null,
        scenes: Array.from({ length: count }, (_, i) => scene(i)),
      },
      meta: { model: "stub", attempts: 1, complexityOverrides: 0, llmLatencyMs: 1 },
    }),
  };
}

const SCRIPT = { script: "A real script long enough to pass validation easily." };

describe("createOrchestratorApi — zero-config assembly", () => {
  it("exposes shared state + sane lane defaults for H2", () => {
    const api = createOrchestratorApi(makeEnv());
    expect(api.policy.maxScenes("free")).toBe(4);
    expect(api.providers.map((p) => p.id)).toEqual(["agnes", "gemini", "hf", "together", "nvidia", "replicate", "pollinations"]);
    expect(DEFAULT_LANE_LIMITS).toEqual({ concurrency: 2, maxQueue: 100 });
    expect(api.breaker).toBeDefined();
    expect(api.tracker).toBeDefined();
    expect(api.metrics).toBeDefined();
  });

  it("pollinations-only env runs a REAL storyboard end to end — zero network", async () => {
    const api = createOrchestratorApi(makeEnv(), { planner: plannerWith(3) });
    const response = await api.handleStoryboard(SCRIPT, auth("free"));

    expect(response.status).toBe(200);
    const body = response.body as StoryboardResponseBody;
    expect(body.summary).toMatchObject({ total: 3, succeeded: 3, failed: 0 });
    for (const row of body.scenes) {
      expect(row.provider).toBe("pollinations");
      expect(row.costTier).toBe("free");
      expect(row.imageUrl).toContain("image.pollinations.ai/prompt/");
    }
    // Shared metrics actually moved:
    expect(api.metrics.snapshot().imagesGenerated).toBe(3);
    expect(api.tracker.summary().outcomes.recorded).toBe(3);
  });

  it("no OpenRouter keys → planner stub 503s honestly; thumbnails still work", async () => {
    const api = createOrchestratorApi(makeEnv()); // no planner override

    const storyboard = await api.handleStoryboard(SCRIPT, auth("pro"));
    expect(storyboard.status).toBe(503);
    const storyboardErr = storyboard.body as ApiErrorBody;
    expect(storyboardErr.error.code).toBe("planner_unavailable");
    expect(storyboardErr.error.message).toContain("OPENROUTER_API_KEYS");

    const thumbnails = await api.handleThumbnails(
      { prompt: "bold youtube thumbnail", count: 2 },
      auth("pro"),
    );
    expect(thumbnails.status).toBe(200);
    expect((thumbnails.body as ThumbnailsResponseBody).summary.succeeded).toBe(2);
  });

  it("POLLINATIONS_ENABLED=false with no keys → failed rows, not a crash", async () => {
    const api = createOrchestratorApi(makeEnv({ POLLINATIONS_ENABLED: "false" }), {
      planner: plannerWith(2),
    });
    const response = await api.handleStoryboard(SCRIPT, auth("free"));

    expect(response.status).toBe(200);
    const body = response.body as StoryboardResponseBody;
    expect(body.summary.failed).toBe(2);
    expect(body.scenes.every((s) => s.error?.includes("No image provider"))).toBe(true);
  });

  it("handleTiers serves the F1 catalog publicly", () => {
    const api = createOrchestratorApi(makeEnv());
    const response = api.handleTiers();
    expect(response.status).toBe(200);
    const body = response.body as TiersResponseBody;
    expect(body.tiers.map((t) => t.tier)).toEqual(["free", "pro", "cinematic"]);
    expect(body.tiers[0]).toMatchObject({ maxScenes: 4, thumbnailOptions: [1, 2] });
  });

  it("TIER_LIMITS env override flows through to truncation", async () => {
    const api = createOrchestratorApi(
      makeEnv({ TIER_LIMITS: JSON.stringify({ free: { maxScenes: 2 } }) }),
      { planner: plannerWith(5) },
    );
    const response = await api.handleStoryboard(SCRIPT, auth("free"));
    const body = response.body as StoryboardResponseBody;
    expect(body.plannedScenes).toBe(5);
    expect(body.generatedScenes).toBe(2);
    expect(body.truncated).toBe(true);
    expect(body.remainingScenes).toBe(3);
  });

  it("an injected F4 gate actually gates (429 through the full stack)", async () => {
    const api = createOrchestratorApi(makeEnv(), {
      planner: plannerWith(2),
      rateLimiter: {
        check: () => ({
          allowed: false,
          limit: 1,
          remaining: 0,
          retryAfterSeconds: 42,
          resetAtSeconds: 1_800_000_042,
        }),
      },
    });
    const response = await api.handleStoryboard(SCRIPT, auth("cinematic"));
    expect(response.status).toBe(429);
    expect(response.headers?.["Retry-After"]).toBe("42");
    expect(api.metrics.snapshot().scenesProcessed).toBe(0); // nothing ran
  });
});
