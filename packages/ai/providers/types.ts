/**
 * Phase 3 — Common ImageProvider Interface
 *
 * Every image-generation provider adapter MUST implement this interface,
 * enabling the Generator Orchestrator to treat them uniformly with
 * transparent key rotation, fallback chains, and error classification.
 */

/** Standardised parameters for a single image-generation request. */
export interface GenerateParams {
  /** Text description of the desired image. */
  prompt: string;
  /** Output image width in pixels (e.g. 1024). */
  width: number;
  /** Output image height in pixels (e.g. 1024). */
  height: number;
  /** Optional seed for reproducible results. */
  seed?: number;
  /** How many images to produce (default 1). */
  count?: number;
}

/** The result of a successful image-generation call. */
export interface GenerateResult {
  /** Array of publicly-accessible image URLs. */
  images: string[];
  /** Human-readable provider name (e.g. "AgnesFlash", "Pollinations"). */
  provider: string;
  /** Wall-clock time of the generation in milliseconds. */
  latencyMs: number;
}

/**
 * Human-readable metadata about a generation attempt that a provider
 * adapter can return alongside its results.
 */
export interface ProviderMeta {
  /** Which model was actually used (useful when the adapter selects one). */
  model?: string;
  /** True when the adapter internally rotated keys or fell back. */
  degraded?: boolean;
  /** Short message to display in UI / logs (e.g. "Rate-limited, rotated key"). */
  info?: string;
}

/**
 * Every provider adapter must implement this interface.
 *
 * Implementations are responsible for:
 *  - Building the correct HTTP request for their upstream API.
 *  - Handling and classifying HTTP errors (429, 4xx, 5xx).
 *  - Communicating rate-limit information back through the return value
 *    or by throwing typed errors (RateLimitError, QuotaExceededError).
 */
export interface ImageProvider {
  /** Short stable identifier (e.g. "agnes-flash", "gemini-flash", "pollinations"). */
  readonly name: string;

  /**
   * Generate one or more images.
   *
   * @throws {RateLimitError}       When a per-minute / short-term limit is hit.
   * @throws {QuotaExceededError}   When a daily / hard quota is exhausted.
   * @throws {ProviderAuthError}    When the API key is invalid.
   * @throws {ProviderUnavailableError} When the upstream is down or returns 5xx.
   */
  generate(params: GenerateParams, signal?: AbortSignal): Promise<GenerateResult & Partial<ProviderMeta>>;

  /**
   * Returns `true` when the provider is configured and likely to work.
   * Useful for gate-checking before attempting a generation.
   */
  isAvailable(): boolean;
}

/* ------------------------------------------------------------------ *
 * Typed errors — the orchestrator catches these to drive its fallback
 * and key-rotation logic.
 * ------------------------------------------------------------------ */

export class RateLimitError extends Error {
  /** Optional server-hinted retry-after in seconds. */
  retryAfter?: number;
  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class QuotaExceededError extends Error {
  constructor(message = "Daily quota exceeded for this provider") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class ProviderAuthError extends Error {
  constructor(message = "Provider authentication failed — check API keys") {
    super(message);
    this.name = "ProviderAuthError";
  }
}

export class ProviderUnavailableError extends Error {
  constructor(message = "Provider temporarily unavailable") {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export class AllKeysExhaustedError extends Error {
  public providerName: string;
  constructor(providerName: string, message?: string) {
    super(message || `All API keys exhausted for ${providerName}`);
    this.name = "AllKeysExhaustedError";
    this.providerName = providerName;
  }
}

/**
 * Narrow type-guards for catch-clause discrimination.
 */
export function isRateLimitError(e: unknown): e is RateLimitError {
  return e instanceof RateLimitError;
}
export function isQuotaExceededError(e: unknown): e is QuotaExceededError {
  return e instanceof QuotaExceededError;
}
export function isProviderAuthError(e: unknown): e is ProviderAuthError {
  return e instanceof ProviderAuthError;
}
export function isAllKeysExhaustedError(e: unknown): e is AllKeysExhaustedError {
  return e instanceof AllKeysExhaustedError;
}
