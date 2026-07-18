/**
 * Phase C1 — RequestQueue: the smart queuing primitive (10k-concurrent).
 *
 * One queue per provider lane bounds how many generations are in flight
 * against that upstream. The contract with C3/E:
 *
 *   - in-flight < concurrency   → run immediately
 *   - waiting    < maxQueue     → wait (FIFO), optional wait timeout
 *   - otherwise                 → INSTANT QueueOverflowError
 *
 * Overflow is a FEATURE: rejecting fast (never hanging) is what lets the
 * router silently re-route surplus traffic to the URL-only Pollinations
 * adapter, which costs the server nothing. A hung promise at 10k RPS is a
 * crashed process; a fast rejection is a routing signal.
 */
export interface RequestQueueOptions {
  /** Max simultaneous in-flight tasks. */
  concurrency: number;
  /** Max waiting tasks before fast-failing. */
  maxQueue: number;
  /** Max ms a task may wait before auto-rejection (default 30_000). */
  queueTimeoutMs?: number;
}

export class QueueOverflowError extends Error {
  readonly queueName: string;

  constructor(queueName: string, detail: string) {
    super(`queue "${queueName}": ${detail}`);
    this.name = "QueueOverflowError";
    this.queueName = queueName;
  }
}

interface Waiter<T> {
  task: () => Promise<T>;
  resolve: (value: Promise<T>) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export class RequestQueue {
  readonly name: string;

  private readonly options: Required<RequestQueueOptions>;
  private inFlightCount = 0;
  private readonly waiters: Waiter<unknown>[] = [];

  constructor(name: string, options: RequestQueueOptions) {
    if (options.concurrency < 1) throw new Error(`RequestQueue("${name}"): concurrency must be >= 1`);
    if (options.maxQueue < 0) throw new Error(`RequestQueue("${name}"): maxQueue must be >= 0`);
    this.name = name;
    this.options = { queueTimeoutMs: 30_000, ...options };
  }

  get inFlight(): number {
    return this.inFlightCount;
  }

  get waiting(): number {
    return this.waiters.length;
  }

  /**
   * Run `task` under the lane's limits.
   * @throws {QueueOverflowError} instantly when saturated (never hangs).
   */
  run<T>(task: () => Promise<T>): Promise<T> {
    if (this.inFlightCount < this.options.concurrency) {
      return this.track(task);
    }
    if (this.waiters.length >= this.options.maxQueue) {
      return Promise.reject(
        new QueueOverflowError(
          this.name,
          `saturated (${this.inFlightCount} in flight, ${this.waiters.length} waiting) — fast-fail for fallback routing`,
        ),
      );
    }
    return new Promise<T>((resolve, reject) => {
      const waiter: Waiter<T> = { task, resolve, reject, timer: undefined };
      waiter.timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter as Waiter<unknown>);
        if (index >= 0) {
          this.waiters.splice(index, 1);
          reject(
            new QueueOverflowError(
              this.name,
              `wait exceeded ${this.options.queueTimeoutMs}ms — fast-fail for fallback routing`,
            ),
          );
        }
      }, this.options.queueTimeoutMs);
      this.waiters.push(waiter as Waiter<unknown>);
    });
  }

  private async track<T>(task: () => Promise<T>): Promise<T> {
    this.inFlightCount += 1;
    try {
      return await task();
    } finally {
      this.inFlightCount -= 1;
      this.drain();
    }
  }

  private drain(): void {
    const waiter = this.waiters.shift();
    if (!waiter) return;
    if (waiter.timer !== undefined) clearTimeout(waiter.timer);
    waiter.resolve(this.track(waiter.task));
  }
}
