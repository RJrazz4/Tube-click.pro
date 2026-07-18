import { describe, expect, it } from "vitest";

import type { ProviderErrorKind } from "../types/index.js";

import { aspectRatioPixels, aspectRatioSizeString } from "./aspect.js";
import { bytesToDataUrl, toBase64 } from "./base64.js";
import { probeHealth } from "./health.js";
import {
  errorFromStatus,
  isNormalizedProviderError,
  NormalizedProviderError,
  parseRetryAfterMs,
} from "./types.js";

describe("aspect utilities", () => {
  it("maps every ratio to its canonical pixels", () => {
    expect(aspectRatioPixels("16:9")).toEqual({ width: 1280, height: 720 });
    expect(aspectRatioPixels("9:16")).toEqual({ width: 720, height: 1280 });
    expect(aspectRatioPixels("1:1")).toEqual({ width: 1024, height: 1024 });
  });

  it("renders OpenAI-images-style size strings", () => {
    expect(aspectRatioSizeString("16:9")).toBe("1280x720");
  });
});

describe("base64", () => {
  it("encodes a known vector", () => {
    expect(toBase64(new TextEncoder().encode("hello"))).toBe("aGVsbG8=");
  });

  it("handles full-byte-range payloads without chunk corruption", () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(bytesToDataUrl(bytes, "image/png")).toBe(
      `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
    );
  });
});

describe("errorFromStatus (taxonomy mapping)", () => {
  it.each<[number, ProviderErrorKind]>([
    [429, "rate_limit"],
    [402, "quota_exceeded"],
    [401, "auth"],
    [403, "auth"],
    [408, "timeout"],
    [500, "provider_unavailable"],
    [503, "provider_unavailable"],
    [400, "invalid_request"],
  ])("HTTP %i → %s", (status, kind) => {
    const err = errorFromStatus("hf", status);
    expect(err.kind).toBe(kind);
    expect(err.provider).toBe("hf");
    expect(err.statusCode).toBe(status);
    expect(err.message).toContain(`HTTP ${status}`);
  });

  it("passes retryAfterMs through", () => {
    expect(errorFromStatus("hf", 429, { retryAfterMs: 3_000 }).retryAfterMs).toBe(3_000);
  });

  it("type guard discriminates correctly", () => {
    expect(isNormalizedProviderError(new NormalizedProviderError("hf", "auth", "x"))).toBe(true);
    expect(isNormalizedProviderError(new Error("x"))).toBe(false);
  });
});

describe("parseRetryAfterMs", () => {
  it("parses seconds to ms", () => {
    expect(parseRetryAfterMs("5")).toBe(5_000);
    expect(parseRetryAfterMs("0.5")).toBe(500);
  });

  it("returns undefined for missing or invalid values", () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs("soon")).toBeUndefined();
    expect(parseRetryAfterMs("-4")).toBeUndefined();
  });
});

describe("probeHealth", () => {
  const T0 = 1_234_567;

  it("up on 2xx with zero latency under a frozen clock", async () => {
    const report = await probeHealth("hf", "https://x", {
      fetchImpl: (async () => new Response(null, { status: 200 })) as typeof fetch,
      now: () => T0,
    });
    expect(report).toMatchObject({ provider: "hf", state: "up", latencyMs: 0, checkedAt: T0 });
  });

  it("degraded on non-2xx with the status in detail", async () => {
    const report = await probeHealth("gemini", "https://x", {
      fetchImpl: (async () => new Response(null, { status: 404 })) as typeof fetch,
      now: () => T0,
    });
    expect(report.state).toBe("degraded");
    expect(report.detail).toBe("HTTP 404");
  });

  it("down on network failure with the error in detail", async () => {
    const report = await probeHealth("agnes", "https://x", {
      fetchImpl: (async () => {
        throw new Error("dns fail");
      }) as typeof fetch,
      now: () => T0,
    });
    expect(report.state).toBe("down");
    expect(report.detail).toContain("dns fail");
  });
});
