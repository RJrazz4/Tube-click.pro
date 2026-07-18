import { describe, expect, it } from "vitest";

import {
  defaultTierLimits,
  EnvValidationError,
  maskKey,
  parseEnv,
  summarizeEnv,
} from "./index.js";

const SECRET_IMAGE_KEY = "ak_live_supersecret";
const SECRET_OR_KEY = "sk-or-v1-topsecret";

describe("parseEnv — happy paths", () => {
  it("parses a fully-specified environment", () => {
    const env = parseEnv({
      IMAGE_API_KEYS: `agnes:${SECRET_IMAGE_KEY},a2;gemini:g1;hf:h1;together:t1;replicate:r1`,
      OPENROUTER_API_KEYS: `${SECRET_OR_KEY}, sk-or-2`,
      POLLINATIONS_ENABLED: "false",
      TIER_LIMITS: '{"free":{"maxScenes":3}}',
    });
    expect(env.imageKeyPools).toEqual({ agnes: [SECRET_IMAGE_KEY, "a2"], gemini: ["g1"], hf: ["h1"], together: ["t1"], replicate: ["r1"], nvidia: [] });
    expect(env.openrouterKeys).toEqual([SECRET_OR_KEY, "sk-or-2"]);
    expect(env.pollinationsEnabled).toBe(false);
    expect(env.tierLimits.free.maxScenes).toBe(3);
    expect(env.tierLimits.pro).toEqual(defaultTierLimits().pro);
  });

  it("applies all defaults when nothing is configured", () => {
    const env = parseEnv({});
    expect(env.imageKeyPools).toEqual({ agnes: [], gemini: [], hf: [], together: [], replicate: [], nvidia: [] });
    expect(env.openrouterKeys).toEqual([]);
    expect(env.pollinationsEnabled).toBe(true);
    expect(env.tierLimits).toEqual(defaultTierLimits());
  });

  it("reads individual env vars (5-Engine Architecture) and merges with legacy", () => {
    const env = parseEnv({
      HUGGINGFACE_API_KEY: "hf_from_individual,hf_second",
      NVIDIA_API_KEY: "nv_key1",
      IMAGE_API_KEYS: "hf:hf_from_legacy;together:t1",
    });
    // Individual + legacy merged, individual keys first, deduped
    expect(env.imageKeyPools.hf).toEqual(["hf_from_individual", "hf_second", "hf_from_legacy"]);
    expect(env.imageKeyPools.together).toEqual(["t1"]);
    expect(env.imageKeyPools.nvidia).toEqual(["nv_key1"]);
  });

  it("individual env vars work without IMAGE_API_KEYS", () => {
    const env = parseEnv({
      HUGGINGFACE_API_KEY: "hf_key1",
      TOGETHER_API_KEY: "tk1,tk2",
      NVIDIA_API_KEY: "nv1",
      REPLICATE_API_KEY: "rp1",
    });
    expect(env.imageKeyPools.hf).toEqual(["hf_key1"]);
    expect(env.imageKeyPools.together).toEqual(["tk1", "tk2"]);
    expect(env.imageKeyPools.nvidia).toEqual(["nv1"]);
    expect(env.imageKeyPools.replicate).toEqual(["rp1"]);
    expect(env.imageKeyPools.agnes).toEqual([]);
    expect(env.imageKeyPools.gemini).toEqual([]);
  });

  it("falls back to the legacy singular OPENROUTER_API_KEY", () => {
    expect(parseEnv({ OPENROUTER_API_KEY: SECRET_OR_KEY }).openrouterKeys).toEqual([SECRET_OR_KEY]);
  });

  it("exposes OPENROUTER_MODEL when set, undefined otherwise", () => {
    expect(parseEnv({}).openrouterModel).toBeUndefined();
    expect(parseEnv({ OPENROUTER_MODEL: "xiaomi/mimo-v2-flash:free" }).openrouterModel).toBe(
      "xiaomi/mimo-v2-flash:free",
    );
  });

  it("prefers the pooled plural var over the singular alias", () => {
    const env = parseEnv({
      OPENROUTER_API_KEYS: "sk-or-a,sk-or-b",
      OPENROUTER_API_KEY: SECRET_OR_KEY,
    });
    expect(env.openrouterKeys).toEqual(["sk-or-a", "sk-or-b"]);
  });

  it.each([
    ["true", true], ["1", true], [" TRUE ", true],
    ["false", false], ["0", false], ["False", false],
  ])("coerces POLLINATIONS_ENABLED=%s to %s", (raw, expected) => {
    expect(parseEnv({ POLLINATIONS_ENABLED: raw }).pollinationsEnabled).toBe(expected);
  });
});

describe("parseEnv — validation failures", () => {
  it("throws EnvValidationError naming the offending variable", () => {
    try {
      parseEnv({ POLLINATIONS_ENABLED: "yes" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).message).toContain("POLLINATIONS_ENABLED");
    }
  });

  it("aggregates multiple problems into one error", () => {
    try {
      parseEnv({ IMAGE_API_KEYS: "nokolon", TIER_LIMITS: "{bad json", POLLINATIONS_ENABLED: "maybe" });
      expect.unreachable("should have thrown");
    } catch (err) {
      const e = err as EnvValidationError;
      expect(e.issues).toHaveLength(3);
      expect(e.message).toContain("IMAGE_API_KEYS");
      expect(e.message).toContain("TIER_LIMITS");
      expect(e.message).toContain("POLLINATIONS_ENABLED");
    }
  });

  it("labels the openrouter field with both accepted variable names", () => {
    try {
      parseEnv({ OPENROUTER_API_KEYS: ",,," });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as EnvValidationError).issues[0]).toContain("OPENROUTER_API_KEYS/OPENROUTER_API_KEY");
    }
  });

  it("never leaks key material into the error message", () => {
    try {
      parseEnv({ IMAGE_API_KEYS: `gemeni:${SECRET_IMAGE_KEY}`, OPENROUTER_API_KEYS: ",,", POLLINATIONS_ENABLED: "huh" });
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as EnvValidationError).message;
      expect(message).not.toContain(SECRET_IMAGE_KEY);
      expect(message).not.toContain(SECRET_OR_KEY);
    }
  });
});

describe("maskKey", () => {
  it("reveals at most six characters of long keys", () => {
    expect(maskKey(SECRET_OR_KEY)).toBe("sk-o...et");
  });

  it("fully masks short keys", () => {
    expect(maskKey("abc")).toBe("***");
    expect(maskKey("12345678")).toBe("***");
  });
});

describe("summarizeEnv", () => {
  it("reports counts and flags only — zero key material", () => {
    const env = parseEnv({
      IMAGE_API_KEYS: `agnes:${SECRET_IMAGE_KEY},a2;hf:h1;together:t1;replicate:r1`,
      OPENROUTER_API_KEY: SECRET_OR_KEY,
      POLLINATIONS_ENABLED: "1",
    });
    const summary = summarizeEnv(env);
    expect(summary).toMatchObject({
      agnesKeys: 2,
      geminiKeys: 0,
      hfKeys: 1,
      togetherKeys: 1,
      replicateKeys: 1,
      nvidiaKeys: 0,
      openrouterKeys: 1,
      pollinationsEnabled: true,
      freeMaxScenes: 4,
      proMaxScenes: 8,
      cinematicMaxScenes: "unlimited",
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(SECRET_IMAGE_KEY);
    expect(serialized).not.toContain(SECRET_OR_KEY);
  });
});
