import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateChatJson, ChatGenerationError } from "../api/_ai";

/**
 * Tests for the unified OpenRouter chat adapter (api/_ai.ts).
 *
 * Uses an injected `fetchImpl` (the orchestrator client accepts one) so we can
 * drive key-by-key, model-by-model responses and assert rotation / failover /
 * timeout behavior without touching the network.
 */

type Spec = { status: number; body?: unknown; headers?: Record<string, string> } | "hang";

/** Build a fake fetch whose response is resolved from (key, model). "hang" waits for abort. */
function makeFetch(resolver: (key: string, model: string) => Spec): typeof fetch {
  return (async (_input: unknown, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const key = String(headers.Authorization || headers.authorization || "").replace(/^Bearer\s+/i, "");
    let model = "?";
    try {
      const parsed = JSON.parse(String(init?.body)) as { model?: unknown };
      if (typeof parsed.model === "string") model = parsed.model;
    } catch {
      /* ignore */
    }
    const spec = resolver(key, model);
    if (spec === "hang") {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((_, reject) => {
        const onAbort = () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    const bodyText = JSON.stringify(spec.body ?? {});
    return new Response(bodyText, {
      status: spec.status,
      headers: { "Content-Type": "application/json", ...(spec.headers ?? {}) },
    });
  }) as typeof fetch;
}

const OK_BODY = {
  choices: [{ message: { content: '{"titles":["t"],"hooks":["h"],"script":"s","hashtags":["#x"],"description":"d"}' } }],
  model: "google/gemini-2.5-flash",
};

const baseOpts = {
  systemPrompt: "sys",
  userPrompt: "usr",
  now: Date.now,
  deadlineMs: 4000,
  attemptTimeoutMs: 400,
};

describe("generateChatJson — unified OpenRouter chat adapter", () => {
  beforeEach(() => {
    vi.stubGlobal("console", { ...console, log: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() });
    process.env.OPENROUTER_API_KEYS = "k1,k2,k3";
    process.env.OPENROUTER_MODEL = "google/gemini-2.5-flash";
    delete process.env.OPENROUTER_MODEL_FALLBACKS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.OPENROUTER_API_KEYS;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_MODEL_FALLBACKS;
    for (let i = 1; i <= 20; i++) delete process.env[`OPENROUTER_API_KEY_${i}`];
  });

  it("succeeds on the first key without rotation", async () => {
    const fetchImpl = makeFetch(() => ({ status: 200, body: OK_BODY }));
    const out = await generateChatJson({ ...baseOpts, fetchImpl });
    expect(out.content).toContain("titles");
    expect(out.keyIndex).toBe(0);
    expect(out.attempts).toBe(1);
    expect(out.failedOver).toBe(false);
    expect(out.modelsAttempted).toEqual(["google/gemini-2.5-flash"]);
  });

  it("rotates keys on 429 and succeeds on a later key (failedOver=true)", async () => {
    const fetchImpl = makeFetch((key) =>
      key === "k1"
        ? { status: 429, headers: { "retry-after": "1" }, body: { error: { message: "slow down" } } }
        : { status: 200, body: OK_BODY },
    );
    const out = await generateChatJson({ ...baseOpts, fetchImpl });
    expect(out.keyIndex).toBe(1); // k2
    expect(out.attempts).toBeGreaterThanOrEqual(2);
    expect(out.failedOver).toBe(true);
  });

  it("surfaces RATE_LIMITED when every key is rate-limited", async () => {
    const fetchImpl = makeFetch(() => ({ status: 429, headers: { "retry-after": "2" }, body: {} }));
    await expect(generateChatJson({ ...baseOpts, fetchImpl })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });

  it("surfaces API_KEY_INVALID when every key is unauthorized (401)", async () => {
    const fetchImpl = makeFetch(() => ({ status: 401, body: { error: { message: "invalid key" } } }));
    await expect(generateChatJson({ ...baseOpts, fetchImpl })).rejects.toMatchObject({
      code: "API_KEY_INVALID",
      status: 500,
    });
  });

  it("surfaces INSUFFICIENT_CREDITS when every key is out of credits (402)", async () => {
    const fetchImpl = makeFetch(() => ({ status: 402, body: {} }));
    await expect(generateChatJson({ ...baseOpts, fetchImpl })).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
      status: 402,
    });
  });

  it("aborts a hung upstream via the per-attempt timeout, then rotates to a healthy key", async () => {
    // k1 hangs until its AbortSignal fires; k2 returns OK immediately.
    const fetchImpl = makeFetch((key) => (key === "k1" ? "hang" : { status: 200, body: OK_BODY }));
    const out = await generateChatJson({ ...baseOpts, attemptTimeoutMs: 120, fetchImpl });
    expect(out.keyIndex).toBe(1); // recovered on k2
    expect(out.failedOver).toBe(true);
  });

  it("fails over to the fallback model when the primary returns 404 (retired model)", async () => {
    process.env.OPENROUTER_MODEL_FALLBACKS = "google/gemini-2.5-flash-lite";
    const fetchImpl = makeFetch((_key, model) =>
      model === "google/gemini-2.5-flash"
        ? { status: 404, body: { error: { message: "no endpoints found" } } }
        : { status: 200, body: { ...OK_BODY, model: "google/gemini-2.5-flash-lite" } },
    );
    const out = await generateChatJson({ ...baseOpts, fetchImpl });
    expect(out.model).toBe("google/gemini-2.5-flash-lite");
    expect(out.modelsAttempted).toEqual(["google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"]);
    expect(out.failedOver).toBe(true);
  });

  it("throws a typed config error (API_KEY_INVALID) when no keys are configured", async () => {
    delete process.env.OPENROUTER_API_KEYS;
    delete process.env.OPENROUTER_API_KEY;
    const fetchImpl = makeFetch(() => ({ status: 200, body: OK_BODY }));
    await expect(generateChatJson({ ...baseOpts, fetchImpl })).rejects.toBeInstanceOf(ChatGenerationError);
    await expect(generateChatJson({ ...baseOpts, fetchImpl })).rejects.toMatchObject({
      code: "API_KEY_INVALID",
      status: 500,
    });
  });

  it("accepts numbered key vars (OPENROUTER_API_KEY_1/2/3)", async () => {
    delete process.env.OPENROUTER_API_KEYS;
    process.env.OPENROUTER_API_KEY_1 = "nk1";
    process.env.OPENROUTER_API_KEY_2 = "nk2";
    const fetchImpl = makeFetch((key) =>
      key === "nk1" ? { status: 200, body: OK_BODY } : { status: 500, body: {} },
    );
    const out = await generateChatJson({ ...baseOpts, fetchImpl });
    expect(out.keyIndex).toBe(0); // nk1 succeeded first
  });
});
