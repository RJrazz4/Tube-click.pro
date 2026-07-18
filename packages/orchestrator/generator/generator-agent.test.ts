import { describe, expect, it } from "vitest";

import {
  DEFAULT_BATCH_CONCURRENCY,
  GeneratorAgent,
} from "./generator-agent.js";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("GeneratorAgent — ordering and concurrency", () => {
  it("uses the Master Plan's default concurrency of 3", () => {
    expect(DEFAULT_BATCH_CONCURRENCY).toBe(3);
    expect(new GeneratorAgent().concurrency).toBe(3);
    expect(new GeneratorAgent({ concurrency: 8 }).concurrency).toBe(8);
    expect(new GeneratorAgent({ concurrency: 0 }).concurrency).toBe(1);
  });

  it("preserves input order regardless of completion order", async () => {
    const agent = new GeneratorAgent({ concurrency: 4 });
    const items = [40, 30, 20, 10, 5, 0]; // earlier items finish LATER
    const results = await agent.generateBatch(items, async (ms) => {
      await delay(ms);
      return `done-${ms}`;
    });
    expect(results).toEqual(items.map((ms) => `done-${ms}`));
  });

  it("reaches but never exceeds the concurrency cap", async () => {
    const agent = new GeneratorAgent(); // default: 3
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);

    const results = await agent.generateBatch(items, async (i) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(5);
      inFlight -= 1;
      return i * 2;
    });

    expect(peak).toBe(3);
    expect(results).toEqual(items.map((i) => i * 2));
  });

  it("handles batches smaller than the cap, and empty batches", async () => {
    const agent = new GeneratorAgent({ concurrency: 3 });
    expect(await agent.generateBatch([1, 2], async (i) => i + 1)).toEqual([2, 3]);
    expect(await agent.generateBatch([], async (i: number) => i)).toEqual([]);
  });

  it("passes the item index to the runner", async () => {
    const agent = new GeneratorAgent({ concurrency: 2 });
    const seen: Array<[string, number]> = [];
    await agent.generateBatch(["a", "b", "c"], async (item, index) => {
      seen.push([item, index]);
      return index;
    });
    expect(seen.sort((a, b) => a[1] - b[1])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
    ]);
  });

  it("scales to storyboard-size batches with every slot filled", async () => {
    const agent = new GeneratorAgent({ concurrency: 3 });
    const items = Array.from({ length: 50 }, (_, i) => i);
    const results = await agent.generateBatch(items, async (i) => i);
    expect(results).toHaveLength(50);
    expect(results.every((value, index) => value === index)).toBe(true);
  });
});

describe("GeneratorAgent — failure isolation", () => {
  it("mapError turns a runner failure into a slot value; the batch continues", async () => {
    const agent = new GeneratorAgent({ concurrency: 2 });
    const ran: number[] = [];
    const results = await agent.generateBatch<number, number | string>(
      [1, 2, 3, 4, 5],
      async (i) => {
        ran.push(i);
        await delay(2);
        if (i === 3) throw new Error("scene 3 exploded");
        return i * 10;
      },
      { mapError: (_err, item) => `failed-${item}` },
    );

    expect(results).toEqual([10, 20, "failed-3", 40, 50]);
    // Every other item still ran — one failure did not stall the pool.
    expect(ran.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("without mapError a runner failure rejects the whole batch", async () => {
    const agent = new GeneratorAgent({ concurrency: 1 });
    await expect(
      agent.generateBatch([1, 2, 3], async (i) => {
        if (i === 2) throw new Error("boom");
        return i;
      }),
    ).rejects.toThrow("boom");
  });
});

describe("GeneratorAgent — abort semantics", () => {
  it("a pre-aborted signal maps every slot without starting any work", async () => {
    const controller = new AbortController();
    controller.abort();
    const agent = new GeneratorAgent({ concurrency: 3 });
    let started = 0;

    const results = await agent.generateBatch<number, number | string>(
      [1, 2, 3],
      async (i) => {
        started += 1;
        return i;
      },
      {
        signal: controller.signal,
        mapError: (err) => (err instanceof Error ? err.name : "unknown"),
      },
    );

    expect(started).toBe(0);
    expect(results).toEqual(["AbortError", "AbortError", "AbortError"]);
  });

  it("abort mid-batch: in-flight finishes, unpicked work is mapped, never run", async () => {
    const controller = new AbortController();
    const agent = new GeneratorAgent({ concurrency: 1 });
    const ran: number[] = [];

    const results = await agent.generateBatch(
      [1, 2, 3],
      async (i) => {
        ran.push(i);
        if (i === 1) {
          await delay(10);
          controller.abort();
        }
        return `ok-${i}`;
      },
      {
        signal: controller.signal,
        mapError: (err, item) =>
          err instanceof Error && err.name === "AbortError"
            ? `skipped-${item}`
            : `error-${item}`,
      },
    );

    expect(results).toEqual(["ok-1", "skipped-2", "skipped-3"]);
    expect(ran).toEqual([1]); // items 2 and 3 never started
  });

  it("abort without mapError rejects the batch", async () => {
    const controller = new AbortController();
    controller.abort();
    const agent = new GeneratorAgent();
    await expect(
      agent.generateBatch([1, 2, 3], async (i) => i, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
