import { describe, expect, it } from "vitest";

import { HF_DEFAULT_BASE_URL, HF_DEFAULT_MODEL, HuggingFaceAdapter } from "./huggingface-adapter.js";
import { NormalizedProviderError } from "./types.js";

const T0 = 1_000_000;

describe("HuggingFaceAdapter (free tier)", () => {
  it("posts inputs+parameters and materializes image bytes as a data URL", async () => {
    let seenUrl: unknown;
    let seenBody: Record<string, unknown> = {};
    let seenAuth: string | undefined;
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      seenUrl = url;
      seenAuth = (init?.headers as Record<string, string>).Authorization;
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(bytes.slice().buffer, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as typeof fetch;

    const adapter = new HuggingFaceAdapter({ keys: ["hf-key"], fetchImpl, now: () => T0 });
    expect(adapter.tier).toBe("free");

    const result = await adapter.generate({
      prompt: "misty forest at dawn",
      negativePrompt: "blurry",
      aspectRatio: "16:9",
      seed: 11,
    });

    expect(result.imageUrl).toBe("data:image/png;base64,AQID");
    expect(result.keyRotations).toBe(0);
    expect(seenUrl).toBe(`${HF_DEFAULT_BASE_URL}/${HF_DEFAULT_MODEL}`);
    expect(seenAuth).toBe("Bearer hf-key");
    expect(seenBody.inputs).toBe("misty forest at dawn");
    const params = seenBody.parameters as Record<string, unknown>;
    expect(params.width).toBe(1280);
    expect(params.height).toBe(720);
    expect(params.negative_prompt).toBe("blurry");
    expect(params.seed).toBe(11);
  });

  it("translates 503 model-loading into provider_unavailable + estimated retryAfterMs", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "Model flux is currently loading", estimated_time: 12 }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    const adapter = new HuggingFaceAdapter({ keys: ["k1"], fetchImpl, now: () => T0 });
    const err = await adapter.generate({ prompt: "x", aspectRatio: "1:1" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NormalizedProviderError);
    const e = err as NormalizedProviderError;
    expect(e.kind).toBe("provider_unavailable");
    expect(e.retryAfterMs).toBe(12_000);
  });

  it("rejects JSON payloads on the binary path as provider_unavailable", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "unexpected" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    const adapter = new HuggingFaceAdapter({ keys: ["k1"], fetchImpl, now: () => T0 });
    await expect(adapter.generate({ prompt: "x", aspectRatio: "1:1" })).rejects.toMatchObject({
      kind: "provider_unavailable",
    });
  });

  it("is unavailable without keys and throws auth on generate", async () => {
    const adapter = new HuggingFaceAdapter({ keys: [], fetchImpl: (async () => new Response()) as unknown as typeof fetch });
    expect(adapter.isAvailable()).toBe(false);
    await expect(adapter.generate({ prompt: "x", aspectRatio: "1:1" })).rejects.toMatchObject({
      kind: "auth",
    });
  });
});
