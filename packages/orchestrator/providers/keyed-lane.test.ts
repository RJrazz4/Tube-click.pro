import { describe, expect, it } from "vitest";

import { KeyedLane } from "./keyed-lane.js";
import { NormalizedProviderError } from "./types.js";

const T0 = 1_000_000;

function okResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

const build =
  (fetchImpl: typeof fetch) => (key: string, signal: AbortSignal) =>
    fetchImpl("https://vendor.test/x", { headers: { Authorization: `Bearer ${key}` }, signal });

describe("KeyedLane", () => {
  it("returns the raw response on first-key success", async () => {
    const fetchImpl = (async () => okResponse({ ok: true })) as typeof fetch;
    const lane = new KeyedLane({ provider: "hf", keys: ["k1", "k2"], fetchImpl, now: () => T0 });
    const result = await lane.request(build(fetchImpl));
    expect(result.response.ok).toBe(true);
    expect(result.keyIndex).toBe(0);
    expect(result.attempts).toBe(1);
  });

  it("rotates on 429 and honors Retry-After cooldown", async () => {
    const authz: string[] = [];
    const fetchImpl = (async (_u: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      authz.push(headers.Authorization);
      if (headers.Authorization === "Bearer k1") {
        return okResponse({ error: "slow" }, { status: 429, headers: { "retry-after": "3" } });
      }
      return okResponse({ ok: true });
    }) as typeof fetch;
    const lane = new KeyedLane({ provider: "hf", keys: ["k1", "k2"], fetchImpl, now: () => T0 });
    const result = await lane.request(build(fetchImpl));
    expect(result.attempts).toBe(2);
    expect(authz).toEqual(["Bearer k1", "Bearer k2"]);
  });

  it("throws auth after every key is exhausted by 401s", async () => {
    const fetchImpl = (async () => okResponse({ error: "bad key" }, { status: 401 })) as typeof fetch;
    const lane = new KeyedLane({ provider: "hf", keys: ["k1", "k2"], fetchImpl, now: () => T0 });
    const err = await lane.request(build(fetchImpl)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NormalizedProviderError);
    expect((err as NormalizedProviderError).kind).toBe("auth");
  });

  it("does not rotate on invalid_request (400)", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return okResponse({ error: "bad input" }, { status: 400 });
    }) as typeof fetch;
    const lane = new KeyedLane({ provider: "hf", keys: ["k1", "k2"], fetchImpl, now: () => T0 });
    await expect(lane.request(build(fetchImpl))).rejects.toMatchObject({
      kind: "invalid_request",
      statusCode: 400,
    });
    expect(calls).toBe(1);
  });

  it("surfaces rate_limit + retryAfterMs when every key is cooling", async () => {
    const fetchImpl = (async () =>
      okResponse({ error: "rl" }, { status: 429, headers: { "retry-after": "5" } })) as typeof fetch;
    const lane = new KeyedLane({
      provider: "hf",
      keys: ["k1", "k2"],
      fetchImpl,
      now: () => T0,
      maxAttempts: 3, // > key count → third lease request hits the exhausted pool
    });
    const err = await lane.request(build(fetchImpl)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NormalizedProviderError);
    const e = err as NormalizedProviderError;
    expect(e.kind).toBe("rate_limit");
    expect(e.retryAfterMs).toBe(5_000);
  });

  it("maps hung requests to timeout", async () => {
    const fetchImpl = ((_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as unknown as typeof fetch;
    const lane = new KeyedLane({ provider: "hf", keys: ["k1"], fetchImpl, timeoutMs: 5 });
    const err = await lane.request(build(fetchImpl)).catch((e: unknown) => e);
    expect((err as NormalizedProviderError).kind).toBe("timeout");
  });

  it("classifies pre-aborted caller signals as timeout (aborted by caller)", async () => {
    const fetchImpl = ((_u: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        const err = new Error("aborted");
        err.name = "AbortError";
        return Promise.reject(err);
      }
      return Promise.resolve(okResponse({}));
    }) as unknown as typeof fetch;
    const lane = new KeyedLane({ provider: "hf", keys: ["k1"], fetchImpl });
    const caller = AbortSignal.abort();
    const err = await lane.request(build(fetchImpl), caller).catch((e: unknown) => e);
    expect((err as NormalizedProviderError).kind).toBe("timeout");
    expect((err as NormalizedProviderError).message).toContain("aborted by caller");
  });

  it("invokes the vendor translateError hook and uses its verdict", async () => {
    const fetchImpl = (async () =>
      okResponse({ error: "Model x is currently loading", estimated_time: 12 }, { status: 503 })) as typeof fetch;
    const lane = new KeyedLane({
      provider: "hf",
      keys: ["k1"],
      fetchImpl,
      now: () => T0,
      translateError: ({ status }) =>
        status === 503
          ? new NormalizedProviderError("hf", "provider_unavailable", "hf: model loading (est. 12000ms)", {
              statusCode: 503,
              retryAfterMs: 12_000,
            })
          : undefined,
    });
    const err = await lane.request(build(fetchImpl)).catch((e: unknown) => e);
    const e = err as NormalizedProviderError;
    expect(e.kind).toBe("provider_unavailable");
    expect(e.retryAfterMs).toBe(12_000);
  });
});
