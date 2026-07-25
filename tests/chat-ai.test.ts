import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateChatJson, ChatGenerationError } from "../api/_ai";

/**
 * Tests for the unified chat adapter (api/_ai.ts), now backed by the
 * Vercel AI Gateway.
 *
 * The gateway client accepts a `fetchImpl` override (passed straight to
 * the AI SDK provider as `fetch`), so we can drive responses and assert
 * error-classification / timeout behavior without touching the network.
 */

type Spec = { status: number; body?: unknown; hangMs?: number };

/** Build a fake fetch whose response is resolved from the model id sent in the body. */
function makeFetch(resolver: (model: string) => Spec): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    let model = "unknown";
    try {
      const parsed = JSON.parse(String(init?.body)) as { model?: unknown };
      if (typeof parsed.model === "string") model = parsed.model;
    } catch {
      /* ignore */
    }
    const spec = resolver(model);
    if (spec.hangMs && spec.hangMs > 0) {
      // Wait up to hangMs but reject immediately if the caller aborts.
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => resolve(), spec.hangMs);
        const onAbort = () => {
          clearTimeout(t);
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        };
        if (init?.signal) {
          if (init.signal.aborted) {
            onAbort();
            return;
          }
          init.signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    }
    return new Response(JSON.stringify(spec.body ?? {}), {
      status: spec.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

/** OpenAI-compatible success response the AI SDK expects. */
function okBody(model: string, content = '{"titles":["t"]}') {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: Date.now(),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

const baseOpts = {
  systemPrompt: "sys",
  userPrompt: "usr",
  deadlineMs: 2000,
};

describe("generateChatJson — Vercel AI Gateway adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("console", {
      ...console,
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
    });
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    process.env.AI_GATEWAY_PRIMARY = "google/gemini-2.5-flash";
    delete process.env.AI_GATEWAY_FALLBACKS;
    delete process.env.OPENROUTER_API_KEYS;
    delete process.env.OPENROUTER_MODEL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_PRIMARY;
    delete process.env.AI_GATEWAY_FALLBACKS;
    delete process.env.OPENROUTER_API_KEYS;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
  });

  it("returns parsed content on a successful 200 from the gateway", async () => {
    const fetchImpl = makeFetch(() => ({
      status: 200,
      body: okBody("google/gemini-2.5-flash"),
    }));
    const out = await generateChatJson({ ...baseOpts, fetchImpl: fetchImpl as any });
    expect(out.content).toContain("titles");
    expect(out.model).toBe("google/gemini-2.5-flash");
    expect(out.keyIndex).toBe(0);
    expect(out.attempts).toBe(1);
    expect(out.failedOver).toBe(false);
    expect(out.modelsAttempted).toEqual(["google/gemini-2.5-flash"]);
  });

  it("classifies 401/403 as API_KEY_INVALID (server config issue)", async () => {
    const fetchImpl = makeFetch(() => ({
      status: 401,
      body: { error: { message: "invalid api key" } },
    }));
    await expect(
      generateChatJson({ ...baseOpts, fetchImpl: fetchImpl as any }),
    ).rejects.toMatchObject({ code: "API_KEY_INVALID", status: 500 });
  });

  it("classifies 402 as INSUFFICIENT_CREDITS", async () => {
    const fetchImpl = makeFetch(() => ({
      status: 402,
      body: { error: { message: "insufficient credits" } },
    }));
    await expect(
      generateChatJson({ ...baseOpts, fetchImpl: fetchImpl as any }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS", status: 402 });
  });

  it("classifies 429 as RATE_LIMITED", async () => {
    const fetchImpl = makeFetch(() => ({
      status: 429,
      body: { error: { message: "rate limited" } },
    }));
    await expect(
      generateChatJson({ ...baseOpts, fetchImpl: fetchImpl as any }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("classifies 404 as MODEL_NOT_FOUND", async () => {
    const fetchImpl = makeFetch(() => ({
      status: 404,
      body: { error: { message: "model not found" } },
    }));
    await expect(
      generateChatJson({ ...baseOpts, fetchImpl: fetchImpl as any }),
    ).rejects.toMatchObject({ code: "MODEL_NOT_FOUND", status: 502 });
  });

  it("classifies 5xx as UPSTREAM_ERROR", async () => {
    const fetchImpl = makeFetch(() => ({
      status: 503,
      body: { error: { message: "overloaded" } },
    }));
    await expect(
      generateChatJson({ ...baseOpts, fetchImpl: fetchImpl as any }),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR", status: 502 });
  });

  it("classifies 400 as BAD_REQUEST", async () => {
    const fetchImpl = makeFetch(() => ({
      status: 400,
      body: { error: { message: "bad request" } },
    }));
    await expect(
      generateChatJson({ ...baseOpts, fetchImpl: fetchImpl as any }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", status: 400 });
  });

  it("aborts a hung upstream via the per-call deadline and surfaces TIMEOUT", async () => {
    // Fake fetch hangs past the deadline; abort should fire.
    const fetchImpl = makeFetch(() => ({ status: 200, hangMs: 5000 }));
    await expect(
      generateChatJson({
        ...baseOpts,
        deadlineMs: 100,
        fetchImpl: fetchImpl as any,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT", status: 504 });
  }, 10000);

  it("throws a typed config error when AI_GATEWAY_API_KEY is missing", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    // Use a fetch that would succeed if called (so we prove key check runs first).
    let called = false;
    const fetchImpl = makeFetch(() => {
      called = true;
      return { status: 200, body: okBody("m") };
    });
    const err = await generateChatJson({ ...baseOpts, fetchImpl: fetchImpl as any }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ChatGenerationError);
    expect(err).toMatchObject({ code: "API_KEY_INVALID", status: 500 });
    // The key-missing guard fires before any network call is made.
    expect(called).toBe(false);
  });
});
