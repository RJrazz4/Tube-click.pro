import { describe, expect, it } from "vitest";

import {
  DEFAULT_MANAGER_MODEL,
  OpenRouterClient,
  OpenRouterError,
  type JsonCompletionRequest,
} from "./openrouter-client.js";

const REQ: JsonCompletionRequest = { messages: [{ role: "user", content: "hi" }] };

function okResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

function completionBody(text: string, model = "echo-model") {
  return {
    choices: [{ message: { role: "assistant", content: text } }],
    model,
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

describe("model selection", () => {
  it("pins the live-verified free manager model (plan's mimo-v2.5-free does not exist)", () => {
    expect(DEFAULT_MANAGER_MODEL).toBe("xiaomi/mimo-v2-flash:free");
  });
});

describe("OpenRouterClient — request shape", () => {
  it("posts a JSON-mode completion with auth + attribution headers", async () => {
    let seenUrl: unknown;
    let seenInit: RequestInit | undefined;
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      seenUrl = url;
      seenInit = init;
      return okResponse(completionBody("{}"));
    }) as typeof fetch;

    const client = new OpenRouterClient({
      keys: ["sk-or-a", "sk-or-b"],
      fetchImpl,
      siteUrl: "https://app.example",
      siteTitle: "TubeClick",
      now: () => 0,
    });
    const res = await client.completeJson(REQ);

    expect(res.content).toBe("{}");
    expect(res.model).toBe("echo-model");
    expect(res.keyIndex).toBe(0);
    expect(res.attempts).toBe(1);
    expect(res.usage?.totalTokens).toBe(15);

    expect(seenUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-a");
    expect(headers["HTTP-Referer"]).toBe("https://app.example");
    expect(headers["X-Title"]).toBe("TubeClick");

    const body = JSON.parse(String(seenInit?.body));
    expect(body.model).toBe(DEFAULT_MANAGER_MODEL);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("honours a model override", async () => {
    let postedModel: unknown;
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      postedModel = JSON.parse(String(init?.body)).model;
      return okResponse(completionBody("{}"));
    }) as typeof fetch;
    const client = new OpenRouterClient({ keys: ["k"], fetchImpl, model: "custom/model", now: () => 0 });
    await client.completeJson(REQ);
    expect(postedModel).toBe("custom/model");
  });

  it("concatenates array-form content parts", async () => {
    const fetchImpl = (async () =>
      okResponse({
        choices: [{ message: { content: [{ text: '{"a":' }, { text: "1}" }] } }],
        model: "m",
      })) as typeof fetch;
    const client = new OpenRouterClient({ keys: ["k"], fetchImpl, now: () => 0 });
    const res = await client.completeJson(REQ);
    expect(res.content).toBe('{"a":1}');
  });

  it("fails fast with zero keys", () => {
    const fetchImpl = (async () => okResponse({})) as typeof fetch;
    expect(() => new OpenRouterClient({ keys: [], fetchImpl })).toThrow(/at least one key/);
  });
});

describe("OpenRouterClient — rotation policy", () => {
  it("exhausts quota-dead keys (402) and rotates to the next", async () => {
    const authz: string[] = [];
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      authz.push(headers.Authorization);
      if (headers.Authorization === "Bearer sk-or-a") {
        return okResponse({ error: { message: "insufficient credits" } }, { status: 402 });
      }
      return okResponse(completionBody("{}"));
    }) as typeof fetch;

    const client = new OpenRouterClient({ keys: ["sk-or-a", "sk-or-b"], fetchImpl, now: () => 0 });
    const res = await client.completeJson(REQ);
    expect(res.keyIndex).toBe(1);
    expect(res.attempts).toBe(2);
    expect(authz).toEqual(["Bearer sk-or-a", "Bearer sk-or-b"]);
  });

  it("surfaces rate_limit with server Retry-After when everything is cooling", async () => {
    const fetchImpl = (async () =>
      okResponse({ error: { message: "slow down" } }, { status: 429, headers: { "retry-after": "7" } })) as typeof fetch;
    const client = new OpenRouterClient({ keys: ["k1", "k2"], fetchImpl, now: () => 1_000_000 });
    try {
      await client.completeJson(REQ);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(OpenRouterError);
      const e = err as OpenRouterError;
      expect(e.kind).toBe("rate_limit");
      expect(e.retryAfterMs).toBe(7_000);
      expect(e.attemptsMade).toBe(2);
    }
  });

  it("throws invalid_request on HTTP 400 without rotating", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return okResponse({ error: { message: "bad model id" } }, { status: 400 });
    }) as typeof fetch;
    const client = new OpenRouterClient({ keys: ["k1", "k2"], fetchImpl, now: () => 0 });
    await expect(client.completeJson(REQ)).rejects.toMatchObject({
      kind: "invalid_request",
      statusCode: 400,
    });
    expect(calls).toBe(1);
  });

  it("treats a 200 response carrying an error field as provider_unavailable", async () => {
    const fetchImpl = (async () =>
      okResponse({ error: { message: "model is offline" } })) as typeof fetch;
    const client = new OpenRouterClient({ keys: ["k1"], fetchImpl, now: () => 0 });
    const err = await client.completeJson(REQ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as OpenRouterError).kind).toBe("provider_unavailable");
  });

  it("maps hung requests to kind timeout and stops at the attempt cap", async () => {
    const fetchImpl = ((_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as unknown as typeof fetch;
    const client = new OpenRouterClient({ keys: ["k1", "k2"], fetchImpl, timeoutMs: 5 });
    const err = await client.completeJson(REQ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OpenRouterError);
    expect((err as OpenRouterError).kind).toBe("timeout");
    expect((err as OpenRouterError).attemptsMade).toBe(2);
  });

  it("stops early when the rotation budget is spent", async () => {
    let calls = 0;
    let t = 0;
    const now = () => (t += 100);
    const fetchImpl = (async () => {
      calls++;
      return okResponse({ error: { message: "rate limited" } }, { status: 429 });
    }) as typeof fetch;
    const client = new OpenRouterClient({ keys: ["k1", "k2"], fetchImpl, now, retryBudgetMs: 150 });
    const err = await client.completeJson(REQ).catch((e: unknown) => e);
    expect(calls).toBe(1);
    expect((err as OpenRouterError).attemptsMade).toBe(1);
  });
});
