import { describe, expect, it } from "vitest";

import { KeyPool } from "./key-pool.js";

/**
 * Phase D1 — Plan-conformance contract.
 *
 * Master Plan D1 specifies: per-provider key pools with
 * getNextKey(), markExhausted(key), reset(). A2 delivered the class
 * (plus health tracking); this suite pins the plan-mandated surface
 * against regressions, independent of the extended behaviors.
 */
describe("KeyPool — Master Plan D1 contract", () => {
  it("exposes exactly the plan-mandated methods", () => {
    const pool = new KeyPool(["a", "b"], { provider: "agnes", now: () => 0 });
    expect(typeof pool.getNextKey).toBe("function");
    expect(typeof pool.markExhausted).toBe("function");
    expect(typeof pool.reset).toBe("function");
  });

  it("getNextKey() returns usable keys across the pool", () => {
    const pool = new KeyPool(["k1", "k2"], { provider: "agnes", now: () => 0 });
    const issued = new Set([pool.getNextKey().key, pool.getNextKey().key]);
    expect(issued).toEqual(new Set(["k1", "k2"]));
  });

  it("markExhausted(key) removes that key from rotation", () => {
    const pool = new KeyPool(["k1", "k2"], { provider: "agnes", now: () => 0 });
    pool.markExhausted("k2");
    expect(pool.getNextKey().key).toBe("k1");
    expect(pool.getNextKey().key).toBe("k1");
  });

  it("throws once every key is exhausted", () => {
    const pool = new KeyPool(["k1"], { provider: "agnes", now: () => 0 });
    pool.markExhausted("k1");
    expect(() => pool.getNextKey()).toThrow(/exhausted/i);
  });

  it("reset() restores every key to service", () => {
    const pool = new KeyPool(["k1", "k2"], { provider: "agnes", now: () => 0 });
    pool.markExhausted("k1");
    pool.markExhausted("k2");
    pool.reset();
    expect(pool.getNextKey().key).toBe("k1");
    expect(pool.getNextKey().key).toBe("k2");
  });

  it("is per-provider: each pool instance owns an independent rotation", () => {
    const a = new KeyPool(["shared-looking-key"], { provider: "agnes", now: () => 0 });
    const b = new KeyPool(["shared-looking-key"], { provider: "hf", now: () => 0 });
    a.markExhausted("shared-looking-key");
    expect(b.availableCount).toBe(1);
  });
});
