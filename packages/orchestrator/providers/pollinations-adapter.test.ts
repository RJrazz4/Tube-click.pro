import { describe, expect, it } from "vitest";

import { NormalizedProviderError } from "./types.js";
import { PollinationsAdapter, POLLINATIONS_BASE_URL } from "./pollinations-adapter.js";

const forbiddenFetch = (() =>
  Promise.reject(new Error("network is forbidden on this path"))) as unknown as typeof fetch;

describe("PollinationsAdapter (URL-only ultimate fallback)", () => {
  it("mints a correctly-parameterized image URL", () => {
    const adapter = new PollinationsAdapter({ fetchImpl: forbiddenFetch, now: () => 0 });
    const url = adapter.buildUrl({
      prompt: "a cat & a dog at sunset",
      aspectRatio: "16:9",
      seed: 42,
    });
    expect(url.startsWith(`${POLLINATIONS_BASE_URL}/`)).toBe(true);
    expect(url).toContain(encodeURIComponent("a cat & a dog at sunset"));
    expect(url).toContain("width=1280");
    expect(url).toContain("height=720");
    expect(url).toContain("seed=42");
    expect(url).toContain("nologo=true");
    expect(url).toContain("model=flux");
  });

  it("maps aspect ratios to pixel sizes", () => {
    const adapter = new PollinationsAdapter({ fetchImpl: forbiddenFetch });
    expect(adapter.buildUrl({ prompt: "x", aspectRatio: "9:16" })).toContain("width=720");
    expect(adapter.buildUrl({ prompt: "x", aspectRatio: "1:1" })).toContain("width=1024");
  });

  it("generate() makes ZERO network calls and returns urlOnly=true", async () => {
    const adapter = new PollinationsAdapter({ fetchImpl: forbiddenFetch, now: () => 7 });
    const result = await adapter.generate({ prompt: "sky over valley", aspectRatio: "16:9" });
    expect(result.urlOnly).toBe(true);
    expect(result.provider).toBe("pollinations");
    expect(result.keyRotations).toBe(0);
    expect(result.latencyMs).toBe(0);
    expect(result.imageUrl).toContain("sky%20over%20valley");
  });

  it("declares its free + keyless nature for the router", () => {
    const adapter = new PollinationsAdapter({ fetchImpl: forbiddenFetch });
    expect(adapter.tier).toBe("free");
    expect(adapter.keyless).toBe(true);
    expect(adapter.id).toBe("pollinations");
  });

  it("respects the disabled flag (POLLINATIONS_ENABLED=false)", async () => {
    const adapter = new PollinationsAdapter({ enabled: false, fetchImpl: forbiddenFetch });
    expect(adapter.isAvailable()).toBe(false);
    await expect(adapter.generate({ prompt: "x", aspectRatio: "1:1" })).rejects.toMatchObject({
      kind: "provider_unavailable",
    });
    const health = await adapter.healthCheck();
    expect(health.state).toBe("down");
    expect(health.detail).toContain("disabled");
  });

  it("reports up without probing by default; probes when asked", async () => {
    const unprobed = await new PollinationsAdapter({ fetchImpl: forbiddenFetch, now: () => 1 }).healthCheck();
    expect(unprobed.state).toBe("up");
    expect(unprobed.detail).toContain("url-only");

    const probedDown = await new PollinationsAdapter({
      fetchImpl: forbiddenFetch,
      probeHealth: true,
      now: () => 1,
    }).healthCheck();
    expect(probedDown.state).toBe("down");
  });

  it("honors a pre-aborted caller signal", async () => {
    const adapter = new PollinationsAdapter({ fetchImpl: forbiddenFetch });
    const err = await adapter
      .generate({ prompt: "x", aspectRatio: "1:1", signal: AbortSignal.abort() })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NormalizedProviderError);
    expect((err as NormalizedProviderError).kind).toBe("timeout");
  });
});
