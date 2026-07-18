import { describe, expect, it } from "vitest";

import { parseEnv } from "../../shared/env/index.js";
import type { AnalyzeResult } from "../manager/index.js";
import type { HealthReport } from "../observability/index.js";

import {
  createOrchestratorApi,
} from "./composition-root.js";
import {
  handleHealth,
  handleMetrics,
  handleMetricsJson,
  PROMETHEUS_CONTENT_TYPE,
} from "./observability-handlers.js";
import { CircuitBreaker } from "../resilience/index.js";
import { CostTracker } from "../cost/index.js";
import { GeneratorMetrics } from "../generator/index.js";
import { TierRateLimiter } from "./rate-limiter.js";
import type { StoryboardPlanner } from "./storyboard-handler.js";
import type { StoryboardResponseBody } from "./storyboard-handler.js";
import type { ApiAuth } from "./types.js";
import type { ObservabilitySnapshot } from "../observability/index.js";
import type { ScenePlan } from "../types/index.js";

const auth: ApiAuth = { tier: "free", clientId: "obs-test" };

describe("observability handlers", () => {
  it("handleMetrics serves Prometheus text with the right content type", () => {
    const response = handleMetrics({
      breaker: new CircuitBreaker(),
      tracker: new CostTracker(),
      metrics: new GeneratorMetrics(),
      rateLimiter: new TierRateLimiter(),
    });
    expect(response.status).toBe(200);
    expect(response.headers?.["content-type"]).toBe(PROMETHEUS_CONTENT_TYPE);
    expect(String(response.body)).toContain("tubeclick_images_generated_total 0");
  });

  it("handleMetricsJson serves the same truth as JSON", () => {
    const response = handleMetricsJson({
      breaker: new CircuitBreaker(),
      tracker: new CostTracker(),
      metrics: new GeneratorMetrics(),
    });
    const body = response.body as ObservabilitySnapshot;
    expect(body.generator.scenesProcessed).toBe(0);
    expect(body.breakers).toEqual([]);
  });

  it("handleHealth is 503 only when truly down", () => {
    const up = handleHealth({
      breaker: new CircuitBreaker(),
      metrics: new GeneratorMetrics(),
      providers: [],
    });
    expect(up.status).toBe(200); // no providers to be down about
    expect((up.body as HealthReport).status).toBe("ok");
  });
});

describe("composition root × H2 — /metrics reflects the WRITE path", () => {
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
      output: { characterProfile: null, scenes: [scene(0), scene(1)] },
      meta: { model: "stub", attempts: 1, complexityOverrides: 0, llmLatencyMs: 1 },
    }),
  };

  it("a real storyboard run flows through into /metrics, /metrics.json and /health", async () => {
    const api = createOrchestratorApi(
      parseEnv({ IMAGE_API_KEYS: "", OPENROUTER_API_KEYS: "", POLLINATIONS_ENABLED: "true" }),
      { planner },
    );

    await api.handleStoryboard({ script: "An observability test script that is long." }, auth);

    const metricsText = api.handleMetrics();
    expect(metricsText.status).toBe(200);
    expect(String(metricsText.body)).toContain("tubeclick_images_generated_total 2");

    const metricsJson = api.handleMetricsJson().body as ObservabilitySnapshot;
    expect(metricsJson.generator.imagesGenerated).toBe(2);
    expect(metricsJson.routing.total).toBe(2);

    const health = api.handleHealth();
    expect(health.status).toBe(200);
    const report = health.body as HealthReport;
    expect(report.status).not.toBe("down");
    expect(report.images).toMatchObject({ generated: 2 });

    // The storyboard body itself stays the F3 contract — observability never leaks in:
    const storyboard = await api.handleStoryboard({ script: "An observability test script that is long." }, auth);
    expect((storyboard.body as StoryboardResponseBody).tier).toBe("free");
  });
});
