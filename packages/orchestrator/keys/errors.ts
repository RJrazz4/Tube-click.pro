/**
 * Phase A2 — Key-pool error taxonomy.
 *
 * These are the rotation signals Phase D's cascades catch:
 *   - AllKeysExhaustedError      → every key in one pool is down (429/quota)
 *   - ProviderNotConfiguredError → routing asked for a pool that has no keys
 *   - UnknownKeyError            → caller marked a key the pool never issued
 *
 * Phase A3's central type system re-exports these; Phase D2's detector
 * normalizes provider HTTP failures into AllKeysExhaustedError triggers.
 */

/** Every key in one provider's pool is exhausted or cooling down. */
export class AllKeysExhaustedError extends Error {
  readonly provider: string;
  /** ms until the soonest-cooling key becomes available again, if any. */
  readonly retryAfterMs: number | undefined;

  constructor(provider: string, options: { retryAfterMs?: number } = {}) {
    super(
      `All API keys exhausted for provider "${provider}"` +
        (options.retryAfterMs !== undefined ? ` — retry in ${options.retryAfterMs}ms` : ""),
    );
    this.name = "AllKeysExhaustedError";
    this.provider = provider;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** Routing requested a provider whose pool has zero configured keys. */
export class ProviderNotConfiguredError extends Error {
  readonly provider: string;

  constructor(provider: string) {
    super(`Provider "${provider}" has no configured API keys (check IMAGE_API_KEYS)`);
    this.name = "ProviderNotConfiguredError";
    this.provider = provider;
  }
}

/** A key was reported against a pool that never issued it. */
export class UnknownKeyError extends Error {
  constructor(provider: string) {
    super(
      `KeyPool("${provider}"): unknown key — only values returned by getNextKey() may be reported`,
    );
    this.name = "UnknownKeyError";
  }
}
