import { describe, expect, it } from "vitest";

import { QueueOverflowError, RequestQueue } from "./request-queue.js";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("RequestQueue (smart request queuing)", () => {
  it("caps concurrent in-flight tasks and drains FIFO", async () => {
    const q = new RequestQueue("t", { concurrency: 2, maxQueue: 10 });
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    let active = 0;
    let observedMax = 0;
    const wrap = (d: (typeof gates)[number]) => async () => {
      active += 1;
      observedMax = Math.max(observedMax, active);
      const value = await d.promise;
      active -= 1;
      return value;
    };
    const pending = gates.map((g) => q.run(wrap(g)));

    expect(q.inFlight).toBe(2);
    expect(q.waiting).toBe(1);

    gates[0].resolve("a");
    await pending[0];
    expect(q.inFlight).toBe(2); // third task drained into the slot

    gates[1].resolve("b");
    gates[2].resolve("c");
    expect(await Promise.all(pending)).toEqual(["a", "b", "c"]);
    expect(observedMax).toBe(2);
    expect(q.inFlight).toBe(0);
  });

  it("fast-fails INSTANTLY when saturated (the 10k overflow signal)", async () => {
    const q = new RequestQueue("t", { concurrency: 1, maxQueue: 1 });
    const gate = deferred<void>();
    const first = q.run(() => gate.promise); // occupies the lane
    const waiting = q.run(() => Promise.resolve("queued")); // occupies backlog
    await expect(q.run(() => Promise.resolve("overflow"))).rejects.toBeInstanceOf(QueueOverflowError);
    await expect(q.run(() => Promise.resolve("overflow2"))).rejects.toThrow(/fast-fail for fallback routing/);
    expect(q.inFlight).toBe(1);
    expect(q.waiting).toBe(1);
    gate.resolve();
    await first;
    expect(await waiting).toBe("queued");
  });

  it("auto-rejects waiters that exceed the queue timeout (never hangs)", async () => {
    const q = new RequestQueue("t", { concurrency: 1, maxQueue: 5, queueTimeoutMs: 15 });
    const gate = deferred<void>();
    const blocking = q.run(() => gate.promise);
    await expect(q.run(() => Promise.resolve())).rejects.toThrow(/wait exceeded 15ms/);
    expect(q.waiting).toBe(0);
    gate.resolve();
    await blocking;
  });

  it("propagates task errors and releases the slot", async () => {
    const q = new RequestQueue("t", { concurrency: 1, maxQueue: 1 });
    await expect(q.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(q.inFlight).toBe(0);
    expect(await q.run(() => Promise.resolve("recovered"))).toBe("recovered");
  });

  it("rejects impossible limits at construction", () => {
    expect(() => new RequestQueue("t", { concurrency: 0, maxQueue: 1 })).toThrow(/concurrency/);
    expect(() => new RequestQueue("t", { concurrency: 1, maxQueue: -1 })).toThrow(/maxQueue/);
  });
});
