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

describe("orchestrator client — success paths", () => {
  it("posts the storyboard payload and maps the response", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(200, {
        tier: "free",
        plannedScenes: 2,
        generatedScenes: 2,
        truncated: false,
        remainingScenes: 0,
        characterProfile: null,
        scenes: [],
        summary: {
          total: 2, succeeded: 2, failed: 0, fallbackTriggered: 0,
          premiumScenes: 0, totalKeyRotations: 0, avgLatencyMs: 100,
        },
        meta: { model: "m", attempts: 1, complexityOverrides: 0, llmLatencyMs: 5 },
      });
    };
    const client = createOrchestratorClient({ baseUrl: "https://api.example.test", fetchImpl });

    const body = await client.storyboard({ script: "a long enough script here", seed: 7 });

    expect(body.tier).toBe("free");
    expect(calls[0]?.url).toBe("https://api.example.test/api/v1/storyboard");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      script: "a long enough script here",
      seed: 7,
    });
    expect(calls[0]?.init.method).toBe("POST");
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
});

describe("orchestrator client — error contract", () => {
  it("429: surfaces server code, message, details, and Retry-After seconds", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(
        429,
        { error: { code: "rate_limit_exceeded", message: "slow down", details: { tier: "free" } } },
        { "retry-after": "6" },
      );
    const client = createOrchestratorClient({ fetchImpl });

    const caught = await client
      .storyboard({ script: "0123456789abcdef" })
      .catch((err: unknown) => err);

    expect(caught).toBeInstanceOf(OrchestratorApiError);
    const err = caught as OrchestratorApiError;
    expect(err.status).toBe(429);
    expect(err.code).toBe("rate_limit_exceeded");
    expect(err.message).toBe("slow down");
    expect(err.retryAfterSeconds).toBe(6);
    expect(err.details).toEqual({ tier: "free" });
  });

  it("400: validation code passes through", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(400, { error: { code: "invalid_request", message: "script too short" } });
    const client = createOrchestratorClient({ fetchImpl });
    const err = (await client.thumbnails({ prompt: "x" }).catch((e: unknown) => e)) as OrchestratorApiError;
    expect(err.status).toBe(400);
    expect(err.code).toBe("invalid_request");
  });

  it("503 planner_unavailable passes through unchanged", async () => {
    const fetchImpl: typeof fetch = async () =>
      jsonResponse(503, { error: { code: "planner_unavailable", message: "brain down" } });
    const client = createOrchestratorClient({ fetchImpl });
    const err = (await client.storyboard({ script: "0123456789abcdef" }).catch((e: unknown) => e)) as OrchestratorApiError;
    expect(err.status).toBe(503);
    expect(err.code).toBe("planner_unavailable");
  });

  it("non-JSON error bodies fall back to the HTTP status message", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("bad gateway", { status: 502 });
    const client = createOrchestratorClient({ fetchImpl });
    const err = (await client.storyboard({ script: "0123456789abcdef" }).catch((e: unknown) => e)) as OrchestratorApiError;
    expect(err.status).toBe(502);
    expect(err.message).toContain("502");
  });

  it("fetch-level failure → network_error with status null", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const client = createOrchestratorClient({ fetchImpl });
    const err = (await client.storyboard({ script: "0123456789abcdef" }).catch((e: unknown) => e)) as OrchestratorApiError;
    expect(err.status).toBeNull();
    expect(err.code).toBe("network_error");
    expect(err.message).toContain("generation service");
  });
});
