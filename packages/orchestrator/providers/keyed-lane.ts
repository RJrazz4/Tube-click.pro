/**
 * Phase C1/C2 — KeyedLane: shared execution lane for keyed adapters.
 *
 * Owns one A2 KeyPool + an optional C1 RequestQueue, and applies the
 * system-wide rotation policy to raw HTTP so adapters only express
 * "how do I call you with this key":
 *
 *   429             → cooldown (Retry-After wins)   → rotate
 *   402 / 401 / 403 → markExhausted                 → rotate
 *   5xx / timeout   → 2s cooldown                   → rotate
 *   other 4xx       → invalid_request, thrown immediately (no rotation)
 *
 * Every failure crossing this boundary is a NormalizedProviderError.
 * Vendor quirks (e.g. HF's 503 model-loading) plug in via translateError.
 */
import { AllKeysExhaustedError, KeyPool, type KeyLease } from "../keys/index.js";
import type { KeyedProviderId, ProviderErrorKind } from "../types/index.js";

import { RequestQueue } from "./request-queue.js";
import {
  errorFromStatus,
  NormalizedProviderError,
  parseRetryAfterMs,
} from "./types.js";

export interface VendorErrorContext {
  status: number;
  /** First chars of the response body (plain text; small). */
  bodyText: string;
  retryAfterMs?: number;
}

export interface KeyedLaneOptions {
  provider: KeyedProviderId;
  keys: string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Per-attempt timeout; default 20_000. */
  timeoutMs?: number;
  /** Attempt cap; default = key count (one rotation). */
  maxAttempts?: number;
  /** Cooldown after 429 without Retry-After; default 20_000. */
  rateLimitCooldownMs?: number;
  /** Saturation lane; when absent the request runs unqueued. */
  queue?: RequestQueue;
  /** Vendor-specific error translation hook (return undefined for default mapping). */
  translateError?: (ctx: VendorErrorContext) => NormalizedProviderError | undefined;
}

export interface LaneSuccess {
  response: Response;
  keyIndex: number;
  attempts: number;
}

const BODY_EXCERPT_LIMIT = 160;

export class KeyedLane {
  readonly provider: KeyedProviderId;

  private readonly pool: KeyPool;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly rateLimitCooldownMs: number;
  private readonly queue?: RequestQueue;
  private readonly translateError?: KeyedLaneOptions["translateError"];

  constructor(options: KeyedLaneOptions) {
    this.provider = options.provider;
    this.pool = new KeyPool(options.keys, { provider: options.provider, now: options.now });
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxAttempts = options.maxAttempts ?? options.keys.length;
    this.rateLimitCooldownMs = options.rateLimitCooldownMs ?? 20_000;
    if (options.queue !== undefined) this.queue = options.queue;
    if (options.translateError !== undefined) this.translateError = options.translateError;
  }

  get poolSize(): number {
    return this.pool.size;
  }

  /**
   * Run one HTTP request with rotation. `build` receives the key and the
   * combined abort signal; it MUST attach the signal to its fetch.
   * On success the raw Response is returned for the adapter to parse.
   */
  request(
    build: (key: string, signal: AbortSignal) => Promise<Response>,
    callerSignal?: AbortSignal,
  ): Promise<LaneSuccess> {
    const task = () => this.attemptLoop(build, callerSignal);
    return this.queue ? this.queue.run(task) : task();
  }

  private async attemptLoop(
    build: (key: string, signal: AbortSignal) => Promise<Response>,
    callerSignal: AbortSignal | undefined,
  ): Promise<LaneSuccess> {
    let attempts = 0;
    let lastError: NormalizedProviderError | undefined;

    while (attempts < this.maxAttempts) {
      let lease: KeyLease;
      try {
        lease = this.pool.getNextKey();
      } catch (err) {
        if (err instanceof AllKeysExhaustedError) {
          const kind: ProviderErrorKind =
            err.retryAfterMs !== undefined ? "rate_limit" : (lastError?.kind ?? "quota_exceeded");
          throw new NormalizedProviderError(
            this.provider,
            kind,
            `${this.provider}: no usable keys after ${attempts} attempt(s)`,
            { retryAfterMs: err.retryAfterMs, statusCode: lastError?.statusCode },
          );
        }
        throw err;
      }

      attempts += 1;
      try {
        const response = await this.fetchWithTimeout(lease, build, callerSignal);
        if (response.ok) {
          this.pool.recordSuccess(lease.key);
          return { response, keyIndex: lease.index, attempts };
        }

        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        const bodyText = (await response.text().catch(() => ""))
          .slice(0, BODY_EXCERPT_LIMIT)
          .replace(/\s+/g, " ")
          .trim();
        const ctx: VendorErrorContext = { status: response.status, bodyText, retryAfterMs };
        const mapped =
          this.translateError?.(ctx) ??
          errorFromStatus(this.provider, response.status, {
            retryAfterMs,
            excerpt: bodyText || undefined,
          });
        lastError = mapped;
        this.applyFailure(lease.key, mapped);
        if (mapped.kind === "invalid_request") throw mapped;
      } catch (err) {
        if (err instanceof NormalizedProviderError) {
          lastError = err;
          this.applyFailure(lease.key, err);
          if (err.kind === "invalid_request") throw err;
          continue;
        }
        lastError = new NormalizedProviderError(
          this.provider,
          "provider_unavailable",
          `${this.provider} network failure: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.applyFailure(lease.key, lastError);
      }
    }

    throw new NormalizedProviderError(
      this.provider,
      lastError?.kind ?? "unknown",
      `${this.provider} request failed after ${attempts} attempt(s): ${lastError?.message ?? "no attempt possible"}`,
      { statusCode: lastError?.statusCode, retryAfterMs: lastError?.retryAfterMs },
    );
  }

  private applyFailure(key: string, error: NormalizedProviderError): void {
    switch (error.kind) {
      case "rate_limit":
        this.pool.recordFailure(key, { cooldownMs: error.retryAfterMs ?? this.rateLimitCooldownMs });
        return;
      case "quota_exceeded":
      case "auth":
        this.pool.markExhausted(key, error.kind);
        return;
      case "timeout":
      case "provider_unavailable":
        this.pool.recordFailure(key, { cooldownMs: 2_000 });
        return;
      default:
        return; // invalid_request / unknown — rotation cannot help
    }
  }

  private async fetchWithTimeout(
    lease: KeyLease,
    build: (key: string, signal: AbortSignal) => Promise<Response>,
    callerSignal: AbortSignal | undefined,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
    try {
      return await build(lease.key, controller.signal);
    } catch (err) {
      const isAbort =
        (typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError") ||
        controller.signal.aborted;
      if (isAbort) {
        const why = callerSignal?.aborted ? "aborted by caller" : `timeout after ${this.timeoutMs}ms`;
        throw new NormalizedProviderError(this.provider, "timeout", `${this.provider} ${why}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }
}
