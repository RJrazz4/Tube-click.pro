import { describe, expect, it } from "vitest";

import { AllKeysExhaustedError, UnknownKeyError } from "./errors.js";
import { KeyPool } from "./key-pool.js";

const T0 = 1_000_000;

function clock(start = T0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("KeyPool construction", () => {
  it("fails fast on an empty or blank-only key list", () => {
    const c = clock();
    expect(() => new KeyPool([], { provider: "agnes", now: c.now })).toThrow(/at least one key/);
    expect(() => new KeyPool([" ", ""], { provider: "agnes", now: c.now })).toThrow(
      /at least one key/,
    );
  });

  it("dedupes repeated keys preserving first-seen order", () => {
    const pool = new KeyPool(["b", "a", "b"], { provider: "agnes", now: clock().now });
    expect(pool.size).toBe(2);
    expect([pool.getNextKey().key, pool.getNextKey().key]).toEqual(["b", "a"]);
  });
});

describe("getNextKey (round-robin)", () => {
  it("rotates k1→k2→k3→k1 and counts handouts as uses", () => {
    const pool = new KeyPool(["k1", "k2", "k3"], { provider: "agnes", now: clock().now });
    const order = [1, 2, 3, 4, 5].map(() => pool.getNextKey().key);
    expect(order).toEqual(["k1", "k2", "k3", "k1", "k2"]);
    expect(pool.snapshot().map((h) => h.uses)).toEqual([2, 2, 1]);
  });

  it("exposes the lease index for caller bookkeeping", () => {
    const pool = new KeyPool(["k1", "k2"], { provider: "agnes", now: clock().now });
    expect(pool.getNextKey()).toEqual({ key: "k1", index: 0 });
    expect(pool.getNextKey()).toEqual({ key: "k2", index: 1 });
  });
});

describe("markExhausted", () => {
  it("skips exhausted keys permanently until reset", () => {
    const pool = new KeyPool(["k1", "k2", "k3"], { provider: "agnes", now: clock().now });
    pool.getNextKey(); // k1 — cursor at 0
    pool.markExhausted("k2");
    const order = [pool.getNextKey().key, pool.getNextKey().key, pool.getNextKey().key];
    expect(order).toEqual(["k3", "k1", "k3"]);
  });

  it("is idempotent and stamps reason + time", () => {
    const pool = new KeyPool(["k1"], { provider: "agnes", now: clock().now });
    pool.markExhausted("k1", "daily quota");
    pool.markExhausted("k1"); // no-op
    const health = pool.snapshot()[0];
    expect(health.status).toBe("exhausted");
    expect(health.exhaustedAt).toBe(T0);
    expect(health.exhaustReason).toBe("daily quota");
  });

  it("throws UnknownKeyError for keys the pool never issued", () => {
    const pool = new KeyPool(["k1"], { provider: "agnes", now: clock().now });
    expect(() => pool.markExhausted("nope")).toThrow(UnknownKeyError);
    expect(() => pool.recordSuccess("nope")).toThrow(UnknownKeyError);
    expect(() => pool.recordFailure("nope")).toThrow(UnknownKeyError);
  });
});

describe("total exhaustion", () => {
  it("throws AllKeysExhaustedError carrying the provider label", () => {
    const pool = new KeyPool(["k1", "k2"], { provider: "hf", now: clock().now });
    pool.markExhausted("k1");
    pool.markExhausted("k2");
    expect(pool.availableCount).toBe(0);
    try {
      pool.getNextKey();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AllKeysExhaustedError);
      const e = err as AllKeysExhaustedError;
      expect(e.provider).toBe("hf");
      expect(e.retryAfterMs).toBeUndefined();
      expect(e.message).toContain('"hf"');
    }
  });
});

describe("cooldown backoff (health tracking)", () => {
  it("skips cooling keys and readmits them once the deadline passes", () => {
    const c = clock();
    const pool = new KeyPool(["k1", "k2"], { provider: "agnes", now: c.now });
    pool.recordFailure("k1", { cooldownMs: 5_000 });
    expect(pool.getNextKey().key).toBe("k2");
    expect(pool.getNextKey().key).toBe("k2");
    c.advance(5_001);
    expect(pool.getNextKey().key).toBe("k1");
  });

  it("throws with retryAfterMs = soonest wakeup when everything is cooling", () => {
    const c = clock();
    const pool = new KeyPool(["k1", "k2"], { provider: "agnes", now: c.now });
    pool.recordFailure("k1", { cooldownMs: 10_000 });
    pool.recordFailure("k2", { cooldownMs: 3_000 });
    try {
      pool.getNextKey();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as AllKeysExhaustedError).retryAfterMs).toBe(3_000);
    }
  });

  it("extends cooldown to the later deadline, never earlier", () => {
    const pool = new KeyPool(["k1"], { provider: "agnes", now: clock().now });
    pool.recordFailure("k1", { cooldownMs: 10_000 });
    pool.recordFailure("k1", { cooldownMs: 4_000 });
    expect(pool.snapshot()[0].cooldownUntil).toBe(T0 + 10_000);
  });

  it("failure without cooldown keeps the key available but degrades health", () => {
    const pool = new KeyPool(["k1"], { provider: "agnes", now: clock().now });
    pool.recordFailure("k1");
    const health = pool.snapshot()[0];
    expect(health.status).toBe("available");
    expect(health).toMatchObject({ failures: 1, consecutiveFailures: 1 });
  });

  it("recordSuccess resets the consecutive-failure streak", () => {
    const pool = new KeyPool(["k1"], { provider: "agnes", now: clock().now });
    pool.recordFailure("k1");
    pool.recordFailure("k1");
    pool.recordSuccess("k1");
    expect(pool.snapshot()[0]).toMatchObject({
      successes: 1,
      failures: 2,
      consecutiveFailures: 0,
    });
  });
});

describe("reset (new billing cycle)", () => {
  it("clears exhaustion, cooldowns, counters, and the cursor", () => {
    const pool = new KeyPool(["k1", "k2"], { provider: "agnes", now: clock().now });
    pool.getNextKey();
    pool.markExhausted("k2", "quota");
    pool.recordFailure("k1", { cooldownMs: 60_000 });
    pool.reset();
    expect(pool.availableCount).toBe(2);
    expect(pool.snapshot().every((h) => h.uses === 0 && h.status === "available")).toBe(true);
    expect(pool.getNextKey().key).toBe("k1"); // cursor restarted at the head
  });
});

describe("snapshot redaction", () => {
  it("masks key material while exposing health counters", () => {
    const raw = "sk-agnes-live-9f8e7d6c5b";
    const pool = new KeyPool([raw], { provider: "agnes", now: clock().now });
    pool.recordFailure(raw);
    const json = JSON.stringify(pool.snapshot());
    expect(json).not.toContain(raw);
    expect(json).toContain("sk-a...5b");
  });
});
