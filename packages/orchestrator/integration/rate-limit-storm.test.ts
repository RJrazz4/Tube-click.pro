/**
 * Phase H3 — 429-simulation integration suite.
 *
 * The user's extreme-scalability condition, proven end to end through
 * the REAL wiring (composition root → E2 pipeline → C3 router → D3
 * cascade → D4 breaker → C2 adapters → C1 lanes → A2 key pools):
 *
 *   "When upstream providers 429, the system must NEVER hang or crash.
 *    Overflow instantly, silently routes to the URL-only Pollinations
 *    lane — zero server fetch, zero user-visible error."
 *
 * Every test drives api.handleStoryboard / api.handleThumbnails with an
 * injected fetch that storms HTTP 429s. Pollinations itself is never
 * fetched (URL-only by design), so a passing storm means: every scene
 * still produced an image, upstream traffic stayed bounded, and the
 * whole batch resolved in milliseconds — not after retries, not ever.
 *
 * Storm anatomy (pinned by the first test, frozen clock):
 *   scene 1   full rotation: agnes×2 keys + gemini + hf = 4 fetches
 *   scene 2   each A2 pool grants ONE least-bad retry = 3 fetches
 *   scene 3   pools refuse (keys still cooling) = 0 fetches, and the
 *             third consecutive failure TRIPS all three breakers
 *   scene 4+  router goes straight to pollinations = 0 fetches forever
 *   → 7 upstream calls for the whole storm, then complete silence.
 */
import { describe, expect, it } from "vitest";

import { parseEnv } from "../../shared/env/index.js";
import { createOrchestratorApi } from "../api/composition-root.js";
import type {
  StoryboardPlanner,
  StoryboardResponseBody,
} from "../api/storyboard-handler.js";
import type { ThumbnailsResponseBody } from "../api/thumbnails-handler.js";
import type { ApiAuth } from "../api/types.js";
import type { AnalyzeResult } from "../manager/index.js";
import {
  HuggingFaceAdapter,
  PollinationsAdapter,
  RequestQueue,
} from "../providers/index.js";
import type { ScenePlan } from "../types/index.js";

/** Frozen clock: breaker cooldowns never elapse mid-test (deterministic). */
const FIXED_NOW = 1_800_000_000_000;
const now = () => FIXED_NOW;

const auth = (tier: ApiAuth["tier"], clientId = "h3-storm"): ApiAuth => ({
  tier,
  clientId,
});

function makeEnv(overrides: Record<string, string> = {}) {
  return parseEnv({
    IMAGE_API_KEYS: "agnes:ak_live_1,ak_live_2;gemini:gk_live_1;hf:hf_tok_1",
    OPENROUTER_API_KEYS: "",
    POLLINATIONS_ENABLED: "true",
    ...overrides,
  });
}

function complexScene(index: number): ScenePlan {
  return {
    index,
    title: `Storm scene ${index}`,
    prompt: `cinematic storm scene ${index}`,
    negativePrompt: "",
    complexity: "COMPLEX",
    aspectRatio: "16:9",
    routingHint: "auto",
  };
}

function plannerWith(count: number): StoryboardPlanner {
  return {
    analyzeScript: async (): Promise<AnalyzeResult> => ({
      output: {
        characterProfile: null,
        scenes: Array.from({ length: count }, (_, i) => complexScene(i)),
      },
      meta: { model: "stub", attempts: 1, complexityOverrides: 0, llmLatencyMs: 1 },
    }),
  };
}

const SCRIPT = { script: "A storm script long enough to pass validation easily." };

/** fetch that 429s every call (Retry-After honored), recording URLs. */
function stormFetch(calls: string[], retryAfterSeconds = 120): typeof fetch {
  return ((input: unknown) => {
    calls.push(String(input));
    return Promise.resolve(
      new Response("slow down", {
        status: 429,
        headers: { "retry-after": String(retryAfterSeconds) },
      }),
    );
  }) as typeof fetch;
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("H3 — 429 storm: silent cascade to URL-only pollinations", () => {
  it("every scene still renders; the storm costs exactly 7 bounded upstream calls", async () => {
    const calls: string[] = [];
    const api = createOrchestratorApi(makeEnv(), {
      fetchImpl: stormFetch(calls),
      planner: plannerWith(4),
      now,
    });

    const started = Date.now();
    const response = await api.handleStoryboard(SCRIPT, auth("cinematic"));
    const elapsed = Date.now() - started;

    expect(response.status).toBe(200);
    const body = response.body as StoryboardResponseBody;
    expect(body.summary).toMatchObject({ total: 4, succeeded: 4, failed: 0 });

    // Every scene produced an image — all URL-only, all free.
    for (const row of body.scenes) {
      expect(row.provider).toBe("pollinations");
      expect(row.costTier).toBe("free");
      expect(row.imageUrl).toContain("image.pollinations.ai/prompt/");
    }
    // Scenes 0–2 reached pollinations through the cascade...
    for (const row of body.scenes.slice(0, 3)) {
      expect(row.isFallback).toBe(true);
      expect(row.attempts).toBe(4); // agnes + gemini + hf + pollinations
    }
    // ...scene 3 never touched the keyed chain at all: breakers open,
    // router went straight to the ultimate lane (the cheaper outcome).
    expect(body.scenes[3]?.isFallback).toBe(false);
    expect(body.scenes[3]?.attempts).toBe(1);

    // The storm anatomy pinned in the file header: 4 + 3 + 0 + 0.
    expect(calls.length).toBe(7);
    // Pollinations is URL-only — the server never fetched it, storm or not.
    expect(calls.every((url) => !url.includes("pollinations"))).toBe(true);

    // The breakers did their job — and told the truth.
    expect(api.breaker.healthMap().agnes).toBe("down");
    expect(api.breaker.healthMap().gemini).toBe("down");
    expect(api.breaker.healthMap().hf).toBe("down");
    // Closed circuits are omitted from the map by design — absence means
    // pollinations flows freely (route() treats missing as healthy).
    expect(api.breaker.healthMap().pollinations).toBeUndefined();

    // Accounting: all 4 scenes generated; 3 arrived via fallback.
    const metrics = api.metrics.snapshot();
    expect(metrics.scenesProcessed).toBe(4);
    expect(metrics.imagesGenerated).toBe(4);
    expect(metrics.fallbackTriggered).toBe(3);

    // Zero-hang: a fully mocked storm resolves nearly instantly.
    expect(elapsed).toBeLessThan(2_000);
  });

  it("storm with no pollinations → failed rows with sanitized errors, HTTP stays 200", async () => {
    const calls: string[] = [];
    const api = createOrchestratorApi(makeEnv({ POLLINATIONS_ENABLED: "false" }), {
      fetchImpl: stormFetch(calls),
      planner: plannerWith(3),
      now,
    });

    const response = await api.handleStoryboard(SCRIPT, auth("pro"));

    expect(response.status).toBe(200); // graceful degradation, never a 500
    const body = response.body as StoryboardResponseBody;
    expect(body.summary.failed).toBe(3);
    expect(body.summary.succeeded).toBe(0);
    for (const row of body.scenes) {
      expect(row.imageUrl).toBeUndefined();
      expect(row.error).toBeTruthy();
      // Defense in depth: no key material ever reaches a client payload.
      expect(row.error).not.toMatch(/ak_live|gk_live|hf_tok/);
    }
    // Same bounded storm anatomy, minus the pollinations tail: 4 + 3 + 0.
    expect(calls.length).toBe(7);
    // And after those 3 consecutive failure-filled scenes, circuits open.
    expect(api.breaker.healthMap().agnes).toBe("down");
  });

  it("breakers stay open across requests — a second storyboard costs ZERO upstream calls", async () => {
    const calls: string[] = [];
    const api = createOrchestratorApi(makeEnv(), {
      fetchImpl: stormFetch(calls),
      planner: plannerWith(3),
      now,
    });

    const first = await api.handleStoryboard(SCRIPT, auth("cinematic"));
    expect((first.body as StoryboardResponseBody).summary.succeeded).toBe(3);
    const callsAfterFirst = calls.length;
    expect(callsAfterFirst).toBe(7);

    const second = await api.handleStoryboard(SCRIPT, auth("cinematic"));
    const secondBody = second.body as StoryboardResponseBody;
    expect(second.status).toBe(200);
    expect(secondBody.summary.succeeded).toBe(3);
    expect(secondBody.scenes.every((row) => row.provider === "pollinations")).toBe(true);
    // Breakers open at route time ⇒ these scenes aren't even "fallbacks".
    expect(secondBody.scenes.every((row) => row.isFallback === false)).toBe(true);

    // The 10k-condition proof: a sustained storm costs the upstream NOTHING.
    expect(calls.length).toBe(callsAfterFirst);
    expect(api.metrics.snapshot().scenesProcessed).toBe(6);
  });

  it("lane saturation → INSTANT silent overflow to pollinations (queued work never hangs)", async () => {
    const gate = deferred();
    const calls: string[] = [];
    // The lane's single slot parks on a slow upstream; one waiter may queue.
    const slowStormFetch = ((input: unknown) => {
      calls.push(String(input));
      return gate.promise.then(
        () => new Response("slow down", { status: 429 }),
      );
    }) as typeof fetch;

    const api = createOrchestratorApi(makeEnv({ IMAGE_API_KEYS: "" }), {
      planner: plannerWith(1),
      providers: [
        new HuggingFaceAdapter({
          keys: ["hf_gate_key"],
          queue: new RequestQueue("provider:hf", { concurrency: 1, maxQueue: 1 }),
          fetchImpl: slowStormFetch,
          now,
        }),
        new PollinationsAdapter({ enabled: true, now }),
      ],
      now,
    });

    // SIMPLE scenes route free-chain-only: everything contends for the
    // single hf lane slot. 8 concurrent requests × 1 thumbnail scene.
    const pending = Array.from({ length: 8 }, (_, i) =>
      api.handleThumbnails({ prompt: "storm overflow thumbnail", count: 1 }, auth("free", `burst-${i}`)),
    );
    let settled = 0;
    const tracked = pending.map((p) =>
      p.then((response) => {
        settled += 1;
        return response;
      }),
    );

    // The lane holds 1 in-flight + 1 queued; the other 6 must overflow
    // INSTANTLY — while the upstream is still parked. Flush microtasks
    // with real (tiny) timers; if overflow hung, settled stays at 0.
    for (let i = 0; i < 100 && settled < 6; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(settled).toBeGreaterThanOrEqual(6);

    gate.release();
    const responses = await Promise.all(tracked);

    for (const response of responses) {
      expect(response.status).toBe(200);
      const body = response.body as ThumbnailsResponseBody;
      expect(body.summary).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
      expect(body.thumbnails[0]?.provider).toBe("pollinations");
      expect(body.thumbnails[0]?.imageUrl).toContain("image.pollinations.ai/prompt/");
    }
    // Exactly ONE upstream fetch for 8 scenes: the in-flight attempt.
    // The queued waiter never fetches — its key is still cooling from
    // that 429 — and the 6 overflows never touched the upstream at all.
    expect(calls.length).toBe(1);
    expect(api.metrics.snapshot().imagesGenerated).toBe(8);
  });

  it("observability tells the truth mid-storm (the H2 surface over H3 chaos)", async () => {
    const calls: string[] = [];
    const api = createOrchestratorApi(makeEnv(), {
      fetchImpl: stormFetch(calls),
      planner: plannerWith(4),
      now,
    });
    await api.handleStoryboard(SCRIPT, auth("cinematic"));

    const health = api.handleHealth();
    expect(health.status).toBe(200); // pollinations up ⇒ degraded, not down
    const healthBody = health.body as {
      status: string;
      providers: Array<{ provider: string; state: string }>;
    };
    expect(healthBody.status).toBe("degraded");
    const stateOf = (id: string) =>
      healthBody.providers.find((p) => p.provider === id)?.state;
    expect(stateOf("agnes")).toBe("down");
    expect(stateOf("hf")).toBe("down");
    expect(stateOf("pollinations")).toBe("up");

    const metrics = api.handleMetrics();
    expect(metrics.status).toBe(200);
    const text = String(metrics.body);
    expect(text).toContain("tubeclick_images_generated_total 4");
    expect(text).toContain("tubeclick_fallback_triggered_total 3");
    expect(text).toContain('tubeclick_breaker_state{provider="agnes"} 2');
    expect(text).toContain('tubeclick_provider_images_total{provider="pollinations"} 4');
  });
});
