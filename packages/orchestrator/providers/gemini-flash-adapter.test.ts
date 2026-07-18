import { describe, expect, it } from "vitest";

import {
  GEMINI_DEFAULT_BASE_URL,
  GEMINI_DEFAULT_MODEL,
  GeminiFlashAdapter,
} from "./gemini-flash-adapter.js";

const T0 = 1_000_000;

function okResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GeminiFlashAdapter (premium, AI Studio generateContent)", () => {
  it("pins the live-verified model id (plan's -free suffix is invalid)", () => {
    expect(GEMINI_DEFAULT_MODEL).toBe("gemini-3.1-flash-image-preview");
  });

  it("posts generateContent with aspect ratio and extracts inlineData", async () => {
    let seenUrl: unknown;
    let seenBody: Record<string, unknown> = {};
    const fetchImpl = (async (url: unknown, init?: RequestInit) => {
      seenUrl = url;
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return okResponse({
        candidates: [
          {
            content: {
              parts: [
                { text: "here you go" },
                { inlineData: { mimeType: "image/jpeg", data: "QUJD" } },
              ],
            },
          },
        ],
      });
    }) as typeof fetch;

    const adapter = new GeminiFlashAdapter({ keys: ["g-key"], fetchImpl, now: () => T0 });
    const result = await adapter.generate({
      prompt: "hero shot, castle behind",
      negativePrompt: "text, watermark",
      aspectRatio: "9:16",
    });

    expect(result.imageUrl).toBe("data:image/jpeg;base64,QUJD");
    expect(String(seenUrl)).toBe(
      `${GEMINI_DEFAULT_BASE_URL}/${GEMINI_DEFAULT_MODEL}:generateContent?key=g-key`,
    );

    const contents = seenBody.contents as Array<{ parts: Array<{ text: string }> }>;
    expect(contents[0].parts[0].text).toContain("hero shot");
    expect(contents[0].parts[0].text).toContain("Avoid: text, watermark");
    const config = seenBody.generationConfig as {
      responseModalities: string[];
      imageConfig: { aspectRatio: string };
    };
    expect(config.responseModalities).toEqual(["IMAGE"]);
    expect(config.imageConfig.aspectRatio).toBe("9:16");
  });

  it("maps promptFeedback blocks to invalid_request (no rotation)", async () => {
    const fetchImpl = (async () =>
      okResponse({ promptFeedback: { blockReason: "SAFETY" } })) as typeof fetch;
    const adapter = new GeminiFlashAdapter({ keys: ["k1"], fetchImpl, now: () => T0 });
    await expect(adapter.generate({ prompt: "x", aspectRatio: "1:1" })).rejects.toMatchObject({
      kind: "invalid_request",
    });
  });

  it("treats a response with no inline image as provider_unavailable", async () => {
    const fetchImpl = (async () =>
      okResponse({ candidates: [{ content: { parts: [{ text: "no image for you" }] } }] })) as typeof fetch;
    const adapter = new GeminiFlashAdapter({ keys: ["k1"], fetchImpl, now: () => T0 });
    await expect(adapter.generate({ prompt: "x", aspectRatio: "1:1" })).rejects.toMatchObject({
      kind: "provider_unavailable",
    });
  });

  it("is unavailable without keys and throws auth on generate", async () => {
    const adapter = new GeminiFlashAdapter({ keys: [], fetchImpl: (async () => okResponse({})) as typeof fetch });
    expect(adapter.isAvailable()).toBe(false);
    await expect(adapter.generate({ prompt: "x", aspectRatio: "1:1" })).rejects.toMatchObject({
      kind: "auth",
    });
  });
});
