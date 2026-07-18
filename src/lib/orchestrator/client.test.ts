import { describe, expect, it } from "vitest";

import {
  createOrchestratorClient,
  OrchestratorApiError,
} from "./client";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** fetchImpl that answers per-path from a route table (first match wins). */
function routerFetch(
  routes: Array<{ match: string; respond: () => Response }>,
  calls: Array<{ url: string; init: RequestInit }>,
): typeof fetch {
  return (async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init: init ?? {} });
    const route = routes.find((r) => u.endsWith(r.match));
    if (!route) return new Response("not found", { status: 404 });
    return route.respond();
  }) as typeof fetch;
}

describe("orchestrator client — success paths", () => {
  it("plans via analyze-storyboard, then posts a Zod-valid batch to /api/v1/storyboard", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = routerFetch(
      [
        {
          match: "/api/analyze-storyboard",
          respond: () =>
            jsonResponse(200, {
              scenes: [
                { scene_number: 1, visual_prompt: "cinematic pasta bowl, golden hour", beat_type: "Opening Hook" },
                { scene_number: 2, visual_prompt: "chef smiling at camera" },
              ],
            }),
        },
        {
          match: "/api/v1/storyboard",
          respond: () =>
            jsonResponse(200, {
              success: true,
              data: {
                tier: "free",
                brand: "Tube.Flash",
                scenes: [
                  { scene_number: 1, image_url: "https://img/1.png", provider: "managed", from_fallback: false },
                  { scene_number: 2, image_url: "", provider: "managed", from_fallback: true },
                ],
                total_scenes: 2,
                requested_scenes: 2,
                truncated: false,
              },
            }),
        },
      ],
      calls,
    );
    const client = createOrchestratorClient({ baseUrl: "https://api.example.test", fetchImpl });

    const body = await client.storyboard({ script: "a long enough script here", seed: 7 });

    // step 1: planner
    expect(calls[0]?.url).toBe("https://api.example.test/api/analyze-storyboard");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ script: "a long enough script here" });

    // step 2: strict-Zod batch body on the VERSIONED single route
    expect(calls[1]?.url).toBe("https://api.example.test/api/v1/storyboard");
    expect(calls[1]?.init.method).toBe("POST");
    const sent = JSON.parse(String(calls[1]?.init.body)) as Record<string, unknown>;
    expect(sent.tier).toBe("free");
    expect(sent.brand).toBe("Tube.Flash");
    expect(sent.aspect_ratio).toBe("16:9");
    expect(sent.seed).toBe(7);
    expect(typeof sent.topic).toBe("string");
    const scenes = sent.scenes as Array<Record<string, unknown>>;
    expect(scenes).toHaveLength(2);
    expect(scenes[0]?.scene_number).toBe(1);
    expect(typeof scenes[0]?.visual_prompt).toBe("string");
    // analysis beat labels ("Opening Hook") must never reach the Zod enum
    expect("beat_type" in (scenes[0] ?? {})).toBe(false);

    // response mapping → UI wire types
    expect(body.tier).toBe("free");
    expect(body.plannedScenes).toBe(2);
    expect(body.generatedScenes).toBe(2);
    expect(body.scenes[0]?.sceneIndex).toBe(0);
    expect(body.scenes[0]?.status).toBe("success");
    expect(body.scenes[0]?.imageUrl).toBe("https://img/1.png");
    expect(body.scenes[0]?.isFallback).toBe(false);
    expect(body.scenes[1]?.status).toBe("failed");
    expect(body.scenes[1]?.error).toBe("Generation failed");
    expect(body.scenes[1]?.isFallback).toBe(true);
    expect(body.summary.succeeded).toBe(1);
  });

  it("posts thumbnails to the SINGULAR /api/v1/thumbnail with house-mapped payload", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = routerFetch(
      [
        {
          match: "/api/v1/thumbnail",
          respond: () =>
            jsonResponse(200, {
              success: true,
              data: {
                tier: "premium",
                brand: "Tube.Flash",
                thumbnails: [{ index: 1, url: "https://t/1.png", provider: "managed", from_fallback: false }],
                total_generated: 1,
                requested: 1,
                total_latency_ms: 1234,
              },
            }),
        },
      ],
      calls,
    );
    const client = createOrchestratorClient({ baseUrl: "https://api.example.test", fetchImpl });

    const body = await client.thumbnails({ prompt: "neon cockpit", count: 2, seed: 5 });

    expect(calls[0]?.url).toBe("https://api.example.test/api/v1/thumbnail");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      title: "neon cockpit",
      emotion: "excited",
      style: "cinematic",
      aspect_ratio: "16:9",
      count: 2,
      tier: "free",
      brand: "Tube.Flash",
      seed: 5,
    });
    expect(body.count).toBe(1);
    expect(body.tier).toBe("pro"); // server premium + anonymous store → pro badge
    expect(body.thumbnails[0]?.latencyMs).toBe(1234);
    expect(body.summary.avgLatencyMs).toBe(1234);
  });

  it("injects auth headers from the provider and forwards abort signals", async () => {
    let seenHeaders: Headers | undefined;
    const fetchImpl: typeof fetch = async (_url, init) => {
      seenHeaders = new Headers(init?.headers);
      return jsonResponse(200, { tiers: [] });
    };
    const client = createOrchestratorClient({
      baseUrl: "",
      fetchImpl,
      getHeaders: () => ({ authorization: "Bearer token-123" }),
    });
    const controller = new AbortController();

    let seenSignal: AbortSignal | undefined;
    const fetchCapture: typeof fetch = async (_url, init) => {
      seenSignal = init?.signal ?? undefined;
      return jsonResponse(200, { tiers: [] });
    };
    const client2 = createOrchestratorClient({ fetchImpl: fetchCapture });

    await client.tiers();
    await client2.tiers(controller.signal);

    expect(seenHeaders?.get("authorization")).toBe("Bearer token-123");
    expect(seenSignal).toBe(controller.signal);
  });

  it("Cancel (AbortError) passes through untouched — not wrapped as network_error", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new DOMException("The user aborted a request.", "AbortError");
    };
    const client = createOrchestratorClient({ fetchImpl });
    const err = (await client.thumbnails({ prompt: "x" }).catch((e: unknown) => e)) as DOMException;
    expect(err).toBeInstanceOf(DOMException);
    expect(err.name).toBe("AbortError");
  });
});

describe("orchestrator client — error contract", () => {
  it("429 shape A: server code, message, details, and Retry-After seconds", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(
        429,
        { error: { code: "rate_limit_exceeded", message: "slow down", details: { tier: "free" } } },
        { "retry-after": "6" },
      );
    const client = createOrchestratorClient({ fetchImpl });

    const err = (await client.thumbnails({ prompt: "x" }).catch((e: unknown) => e)) as OrchestratorApiError;

    expect(err).toBeInstanceOf(OrchestratorApiError);
    expect(err.status).toBe(429);
    expect(err.code).toBe("rate_limit_exceeded");
    expect(err.message).toBe("slow down");
    expect(err.retryAfterSeconds).toBe(6);
    expect(err.details).toEqual({ tier: "free" });
  });

  it("400 shape B (live v1 envelope): mapped to invalid_request with field details", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(400, {
        success: false,
        error: "Validation failed",
        code: "BAD_REQUEST",
        fields: [{ field: "title", message: "Required" }],
      });
    const client = createOrchestratorClient({ fetchImpl });
    const err = (await client.thumbnails({ prompt: "x" }).catch((e: unknown) => e)) as OrchestratorApiError;
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_request");
    expect(err.message).toBe("Validation failed");
    expect(err.details).toEqual({ fields: [{ field: "title", message: "Required" }] });
  });

  it("planner failure → planner_unavailable, preserving status + Retry-After", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(
        503,
        { error: { code: "brain_down", message: "brain down" } },
        { "retry-after": "9" },
      );
    const client = createOrchestratorClient({ fetchImpl });
    const err = (await client.storyboard({ script: "0123456789abcdef" }).catch((e: unknown) => e)) as OrchestratorApiError;
    expect(err.status).toBe(503);
    expect(err.code).toBe("planner_unavailable");
    expect(err.message).toContain("Scene planning failed");
    expect(err.retryAfterSeconds).toBe(9);
  });

  it("planner returning zero scenes → 502 planner_unavailable", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse(200, { scenes: [] });
    const client = createOrchestratorClient({ fetchImpl });
    const err = (await client.storyboard({ script: "0123456789abcdef" }).catch((e: unknown) => e)) as OrchestratorApiError;
    expect(err.status).toBe(502);
    expect(err.code).toBe("planner_unavailable");
  });

  it("non-JSON error bodies fall back to the HTTP status message", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("bad gateway", { status: 502 });
    const client = createOrchestratorClient({ fetchImpl });
    const err = (await client.thumbnails({ prompt: "x" }).catch((e: unknown) => e)) as OrchestratorApiError;
    expect(err.status).toBe(502);
    expect(err.message).toContain("502");
  });

  it("fetch-level failure → network_error with status null", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const client = createOrchestratorClient({ fetchImpl });
    const err = (await client.thumbnails({ prompt: "x" }).catch((e: unknown) => e)) as OrchestratorApiError;
    expect(err.status).toBeNull();
    expect(err.code).toBe("network_error");
    expect(err.message).toContain("generation service");
  });
});
