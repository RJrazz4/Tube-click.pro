/**
 * Phase E1 — GeneratorAgent: bounded-concurrency batch engine.
 *
 * One scene's failure must never stall or kill a batch — at 10k users,
 * partial success beats total failure every time. The agent fans work out
 * through a FIXED worker pool (default 3, the Master Plan's E1 batch
 * concurrency) and preserves input order: results[i] always belongs to
 * items[i], regardless of completion order.
 *
 * Guarantees (all test-locked):
 *   - at most `concurrency` tasks in flight, ever — a fixed pool with no
 *     intermediate queue, so memory stays flat under load spikes
 *   - with `mapError` provided, a throwing runner cannot poison the pool:
 *     its slot becomes the mapped error value and the batch continues
 *   - an aborted signal stops PICKING new work (remaining slots become
 *     mapped abort errors); in-flight work finishes — per-request cancel
 *     lives in the runner's own signal path (E2/D3 layers)
 *   - pure engine: no I/O, no timers, no provider knowledge — E2 supplies
 *     the per-scene runner and the error mapping
 */

/** Master Plan E1: fixed batch concurrency. */
export const DEFAULT_BATCH_CONCURRENCY = 3;

export interface GeneratorAgentOptions {
  /** Worker pool size; default 3. Values below 1 clamp to 1. */
  concurrency?: number;
}

export interface BatchRunOptions<T, R> {
  /** Stops new work from starting; in-flight work completes. */
  signal?: AbortSignal;
  /** Maps a runner failure (or an abort) into a slot value. */
  mapError?: (err: unknown, item: T, index: number) => R;
}

function abortError(): Error {
  const err = new Error("batch aborted before this item started");
  err.name = "AbortError";
  return err;
}

export class GeneratorAgent {
  readonly concurrency: number;

  constructor(options: GeneratorAgentOptions = {}) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_BATCH_CONCURRENCY));
  }

  /**
   * Fan `items` out through the worker pool. Resolves with one value per
   * input item, in input order. Rejects only when a runner fails (or the
   * signal aborted) WITHOUT `mapError` — with `mapError` it never rejects.
   */
  async generateBatch<T, R>(
    items: readonly T[],
    run: (item: T, index: number) => Promise<R>,
    options: BatchRunOptions<T, R> = {},
  ): Promise<R[]> {
    if (items.length === 0) return [];

    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        const item = items[index];

        if (options.signal?.aborted) {
          // Claim remaining slots WITHOUT running them: mapped abort errors,
          // or (no mapError) a batch-level rejection.
          if (options.mapError === undefined) throw abortError();
          results[index] = options.mapError(abortError(), item, index);
          continue;
        }

        try {
          results[index] = await run(item, index);
        } catch (err) {
          if (options.mapError === undefined) throw err;
          results[index] = options.mapError(err, item, index);
        }
      }
    };

    const workerCount = Math.min(this.concurrency, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }
}
