import { describe, expect, it } from "vitest";

import { AllKeysExhaustedError } from "../keys/index.js";
import { OpenRouterError } from "../manager/index.js";
import { NormalizedProviderError, QueueOverflowError } from "../providers/index.js";
import type { ProviderErrorKind } from "../types/index.js";

import {
  actionForKind,
  DEFAULT_PROVIDER_COOLDOWN_MS,
  detect,
  isProviderRetryable,
  sanitizeMessage,
} from "./detector.js";

describe("detect — already-classified errors pass through", () => {
  it.each([
    ["rate_limit", "cooldown-provider"],
    ["provider_unavailable", "cooldown-provider"],
    ["timeout", "cooldown-provider"],
    ["quota_exceeded", "next-provider"],
    ["auth", "next-provider"],
    ["invalid_request", "abort"],
    ["unknown", "abort"],
  ] as Array<[ProviderErrorKind, string]>)(
    "NormalizedProviderError kind %s → action %s",
    (kind, action) => {
      const d = detect(new NormalizedProviderError("hf", kind, "boom"));
      expect(d.kind).toBe(kind);
      expect(d.action).toBe(action);
      expect(d.source).toBe("normalized");
      expect(d.provider).toBe("hf");
    },
  );

  it("carries retryAfterMs from a normalized 429", () => {
    const d = detect(new NormalizedProviderError("hf", "rate_limit", "rl", { retryAfterMs: 4_000 }));
    expect(d.retryAfterMs).toBe(4_000);
  });

  it("normalizes OpenRouterError from the manager brain", () => {
    const d = detect(new OpenRouterError("quota_exceeded", "credits", { statusCode: 402 }));
    expect(d.kind).toBe("quota_exceeded");
    expect(d.action).toBe("next-provider");
    expect(d.source).toBe("normalized");
  });
});

describe("detect — pool and queue signals", () => {
  it("AllKeysExhaustedError with retryAfterMs → cooldown-provider (keys merely cooling)", () => {
    const d = detect(new AllKeysExhaustedError("hf", { retryAfterMs: 7_500 }));
    expect(d).toMatchObject({
      kind: "rate_limit",
      action: "cooldown-provider",
      retryAfterMs: 7_500,
      source: "pool-exhausted",
    });
  });

  it("AllKeysExhaustedError without retryAfterMs → next-provider (cycle-dead)", () => {
    expect(detect(new AllKeysExhaustedError("hf")).action).toBe("next-provider");
  });

  it("QueueOverflowError → next-provider — THE 10k silent-overflow trigger", () => {
    const d = detect(new QueueOverflowError("hf", "saturated (2 in flight, 100 waiting)"));
    expect(d.action).toBe("next-provider");
    expect(d.source).toBe("queue-overflow");
    expect(d.kind).toBe("rate_limit");
  });
});

describe("detect — HTTP-like and vendor signatures", () => {
  it.each([
    [{ status: 429 }, "rate_limit"],
    [{ statusCode: 402 }, "quota_exceeded"],
    [{ status: 401 }, "auth"],
    [{ statusCode: 503 }, "provider_unavailable"],
    [{ status: 400 }, "invalid_request"],
  ] as Array<[Record<string, unknown>, ProviderErrorKind]>)("%o → kind %s", (input, kind) => {
    expect(detect(input).kind).toBe(kind);
    expect(detect(input).source).toBe("http-like");
  });

  it("reads structural retryAfterMs from HTTP-like values", () => {
    expect(detect({ status: 429, retryAfterMs: 2_000 }).retryAfterMs).toBe(2_000);
  });

  it.each([
    ["Error: insufficient credits remaining on account", "quota_exceeded"],
    ["429 Too Many Requests", "rate_limit"],
    ["Invalid API key provided", "auth"],
    ["upstream socket timeout", "timeout"],
    ["Model is currently loading, try later", "provider_unavailable"],
  ] as Array<[string, ProviderErrorKind]>)("message %j → kind %s", (message, kind) => {
    const d = detect(new Error(message));
    expect(d.kind).toBe(kind);
    expect(d.source).toBe("vendor-signature");
  });

  it("handles bare strings", () => {
    expect(detect("quota exceeded for today").kind).toBe("quota_exceeded");
  });

  it("unrecognized failures → kind unknown, action abort", () => {
    const d = detect(new Error("something entirely novel"));
    expect(d).toMatchObject({ kind: "unknown", action: "abort", source: "unknown" });
  });
});

describe("sanitizeMessage (defense in depth)", () => {
  it("redacts bearer tokens, sk- keys, and key= params", () => {
    expect(sanitizeMessage("got Bearer abc123SECRET back")).not.toContain("abc123SECRET");
    expect(sanitizeMessage("auth failed for sk-or-v1-abcdef")).toBe("auth failed for sk-***");
    expect(sanitizeMessage("bad: key=live_987654")).toBe("bad: key=***");
  });

  it("caps length at the message limit", () => {
    expect(sanitizeMessage("x".repeat(500)).length).toBeLessThanOrEqual(200);
  });
});

describe("verdict helpers", () => {
  it("isProviderRetryable covers exactly the transient kinds", () => {
    expect(isProviderRetryable("rate_limit")).toBe(true);
    expect(isProviderRetryable("provider_unavailable")).toBe(true);
    expect(isProviderRetryable("timeout")).toBe(true);
    expect(isProviderRetryable("quota_exceeded")).toBe(false);
    expect(isProviderRetryable("auth")).toBe(false);
    expect(isProviderRetryable("invalid_request")).toBe(false);
  });

  it("actionForKind matches the cascade policy table", () => {
    expect(actionForKind("rate_limit")).toBe("cooldown-provider");
    expect(actionForKind("auth")).toBe("next-provider");
    expect(actionForKind("invalid_request")).toBe("abort");
  });

  it("default provider cooldown is sane", () => {
    expect(DEFAULT_PROVIDER_COOLDOWN_MS).toBe(20_000);
  });
});
