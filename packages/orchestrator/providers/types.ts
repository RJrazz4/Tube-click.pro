/**
 * Phase C1 — Provider interface + normalized failure model.
 *
 * Every image adapter implements ImageProvider. The router (C3) and
 * generator (E) only ever see this surface — raw HTTP stays inside the
 * adapter, failures come out as NormalizedProviderError on the A3
 * ProviderErrorKind taxonomy so rotation/circuit logic (D) never parses
 * vendor payloads.
 *
 * Scalability invariants (10k-concurrent contract):
 *   - adapters are STATELESS beyond key health — safe across instances
 *   - generate() respects AbortSignal end-to-end
 *   - URL-only providers (pollinations) cost the server ~0 CPU/network
 */
import type {
  AspectRatio,
  ProviderErrorKind,
  ProviderId,
  ProviderTier,
} from "../types/index.js";

export interface ImageGenerateRequest {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatio;
  /** Reproducibility seed; omitted = provider-chosen randomness. */
  seed?: number;
  /** Caller cancellation — honored by every adapter. */
  signal?: AbortSignal;
  /** Analytics tag (scene index etc.); never PII or key material. */
  requestTag?: string;
}

export interface ImageGenerateResult {
  imageUrl: string;
  provider: ProviderId;
  /** True when the URL is pass-through and was never fetched server-side. */
  urlOnly: boolean;
  latencyMs: number;
  /** Pool key index used; undefined for keyless providers. */
  keyIndex?: number;
  /** Key rotations consumed for this generation (E4 metric feed). */
  keyRotations: number;
}

export type ProviderState = "up" | "degraded" | "down";

export interface ProviderHealthReport {
  provider: ProviderId;
  state: ProviderState;
  detail?: string;
  latencyMs: number;
  checkedAt: number;
}

export interface ImageProvider {
  readonly id: ProviderId;
  /** Free cost class is preferred by routing (token-saving mandate). */
  readonly tier: ProviderTier;
  /** Keyless providers cannot be key-exhausted — the ultimate fallback trait. */
  readonly keyless: boolean;
  /** Configured and expected to work (keys present / feature enabled). */
  isAvailable(): boolean;
  generate(request: ImageGenerateRequest): Promise<ImageGenerateResult>;
  healthCheck(): Promise<ProviderHealthReport>;
}

/** The one error type the rest of the system catches from providers. */
export class NormalizedProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly provider: ProviderId;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;

  constructor(
    provider: ProviderId,
    kind: ProviderErrorKind,
    message: string,
    options: { statusCode?: number; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = "NormalizedProviderError";
    this.provider = provider;
    this.kind = kind;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

export function isNormalizedProviderError(err: unknown): err is NormalizedProviderError {
  return err instanceof NormalizedProviderError;
}

/** Narrowing guard shared by every vendor payload parser. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** Shared HTTP status → taxonomy mapping for every keyed adapter. */
export function errorFromStatus(
  provider: ProviderId,
  status: number,
  options: { retryAfterMs?: number; excerpt?: string } = {},
): NormalizedProviderError {
  const kind: ProviderErrorKind =
    status === 429
      ? "rate_limit"
      : status === 402
        ? "quota_exceeded"
        : status === 401 || status === 403
          ? "auth"
          : status === 408
            ? "timeout"
            : status >= 500
              ? "provider_unavailable"
              : "invalid_request";
  const detail = options.excerpt ? `: ${options.excerpt}` : "";
  return new NormalizedProviderError(provider, kind, `${provider} HTTP ${status}${detail}`, {
    statusCode: status,
    retryAfterMs: options.retryAfterMs,
  });
}

/** Parse a Retry-After header value (seconds) into ms. */
export function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number.parseFloat(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : undefined;
}
