import { describe, expect, it } from "vitest";

import { AGNES_DEFAULT_MODEL, AgnesFlashAdapter } from "./agnes-flash-adapter.js";

const T0 = 1_000_000;

function okResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AgnesFlashAdapter (premium, OpenAI-images shape)", () => {
  it("posts the correct generation payload and returns data[0].url", async () => {
    let seenUrl: unknown;
    let seenBody: Record<string, unknown> = {};
    let seenAuth: string | undefined;
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      seenUrl = url;
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      seenAuth = (init?.headers as Record<string, string>).Authorization;
      return okResponse({ data: [{ url: "https://cdn.vendor/img.png" }] });
    }) as typeof fetch;

    const adapter = new AgnesFlashAdapter({ keys: ["k1", "k2"], fetchImpl, now: () => T0 });
    const result = await adapter.generate({
      prompt: "armored knight, dramatic light",
      negativePrompt: "blurry",
      aspectRatio: "16:9",
      seed: 7,
    });

    expect(result.imageUrl).toBe("https://cdn.vendor/img.png");
    expect(result.provider).toBe("agnes");
    expect(result.urlOnly).toBe(false);
    expect(result.keyIndex).toBe(0);
    expect(result.keyRotations).toBe(0);

    expect(seenUrl).toBe("https://api.agnesflash.io/v1/images/generations");
    expect(seenAuth).toBe("Bearer k1");
    expect(seenBody.model).toBe(AGNES_DEFAULT_MODEL);
    expect(seenBody.size).toBe("1280x720");
    expect(seenBody.n).toBe(1);
    expect(seenBody.response_format).toBe("url");
    expect(seenBody.negative_prompt).toBe("blurry");
    expect(seenBody.seed).toBe(7);
  });

  it("materializes b64_json responses as data URLs", async () => {
    const fetchImpl = (async () => okResponse({ data: [{ b64_json: "QUJD" }] })) as typeof fetch;
    const adapter = new AgnesFlashAdapter({ keys: ["k1"], fetchImpl, now: () => T0 });
    const result = await adapter.generate({ prompt: "x", aspectRatio: "1:1" });
    expect(result.imageUrl).toBe("data:image/png;base64,QUJD");
  });

  it("fails as provider_unavailable when the payload has no image", async () => {
    const fetchImpl = (async () => okResponse({ data: [{}] })) as typeof fetch;
    const adapter = new AgnesFlashAdapter({ keys: ["k1"], fetchImpl, now: () => T0 });
    await expect(adapter.generate({ prompt: "x", aspectRatio: "1:1" })).rejects.toMatchObject({
      kind: "provider_unavailable",
    });
  });

  it("is unavailable without keys and throws auth on generate", async () => {
    const adapter = new AgnesFlashAdapter({ keys: [], fetchImpl: (async () => okResponse({})) as typeof fetch });
    expect(adapter.isAvailable()).toBe(false);
    await expect(adapter.generate({ prompt: "x", aspectRatio: "1:1" })).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("is premium-tier for the router's token-saving policy", () => {
    const adapter = new AgnesFlashAdapter({ keys: ["k1"], fetchImpl: (async () => okResponse({})) as typeof fetch });
    expect(adapter.tier).toBe("premium");
    expect(adapter.keyless).toBe(false);
  });
});
