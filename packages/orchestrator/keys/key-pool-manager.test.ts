import { describe, expect, it } from "vitest";

import type { ImageKeyPools } from "../../shared/env/index.js";

import { AllKeysExhaustedError, ProviderNotConfiguredError } from "./errors.js";
import { KeyPool } from "./key-pool.js";
import { KeyPoolManager } from "./key-pool-manager.js";

const POOLS: ImageKeyPools = { agnes: ["a1", "a2"], gemini: [], hf: ["h1"], together: [], replicate: [], nvidia: [] };

describe("KeyPoolManager", () => {
  it("builds pools only for configured providers, in canonical order", () => {
    const m = new KeyPoolManager(POOLS, { now: () => 0 });
    expect(m.configuredProviders()).toEqual(["agnes", "hf"]);
    expect(m.hasKeys("agnes")).toBe(true);
    expect(m.hasKeys("gemini")).toBe(false);
  });

  it("fromEnv wires A1 validated env output", () => {
    const m = KeyPoolManager.fromEnv({ imageKeyPools: POOLS });
    expect(m.pool("hf")).toBeInstanceOf(KeyPool);
    expect(m.pool("hf").size).toBe(1);
  });

  it("pool() throws a descriptive error for unconfigured providers", () => {
    const m = new KeyPoolManager(POOLS);
    expect(() => m.pool("gemini")).toThrow(ProviderNotConfiguredError);
    expect(() => m.pool("gemini")).toThrow(/"gemini"/);
    expect(() => m.pool("gemini")).toThrow(/IMAGE_API_KEYS/);
  });

  it("propagates the injected clock into every pool", () => {
    let t = 1_000;
    const m = new KeyPoolManager(
      { agnes: ["a1"], gemini: [], hf: ["h1"], together: [], replicate: [], nvidia: [] },
      { now: () => t },
    );
    m.pool("agnes").recordFailure("a1", { cooldownMs: 500 });
    expect(() => m.pool("agnes").getNextKey()).toThrow(AllKeysExhaustedError);
    t += 501;
    expect(m.pool("agnes").getNextKey().key).toBe("a1");
  });

  it("reset() cascades to every provider pool", () => {
    const m = new KeyPoolManager(POOLS);
    m.pool("agnes").markExhausted("a1");
    m.pool("agnes").markExhausted("a2");
    m.pool("hf").markExhausted("h1");
    m.reset();
    expect(m.pool("agnes").availableCount).toBe(2);
    expect(m.pool("hf").availableCount).toBe(1);
  });

  it("snapshotAll covers configured providers with masked identities only", () => {
    const m = new KeyPoolManager({
      agnes: ["sk-agnes-001-secret"],
      gemini: [],
      hf: ["hf-key-002-secret"],
      together: ["together-key-003-secret"],
      replicate: [],
      nvidia: [],
    });
    const snap = m.snapshotAll();
    expect(Object.keys(snap)).toEqual(["agnes", "hf", "together"]);
    expect(snap.agnes).toHaveLength(1);
    expect(snap.together).toHaveLength(1);
    const json = JSON.stringify(snap);
    expect(json).not.toContain("sk-agnes-001-secret");
    expect(json).not.toContain("hf-key-002-secret");
    expect(json).not.toContain("together-key-003-secret");
  });

  it("handles a zero-key environment (Pollinations-only deployments)", () => {
    const m = new KeyPoolManager({ agnes: [], gemini: [], hf: [], together: [], replicate: [], nvidia: [] });
    expect(m.configuredProviders()).toEqual([]);
    expect(m.snapshotAll()).toEqual({});
    expect(() => m.pool("hf")).toThrow(ProviderNotConfiguredError);
  });
});
