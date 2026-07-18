/**
 * Phase A3 — Provider-level types (Master Plan C: Adapters & Routing).
 *
 * ProviderId is the orchestrator's superset of A1's pool-backed ids:
 * the keyed providers (agnes/gemini/hf/together/replicate/nvidia) PLUS pollinations, the
 * keyless ultimate fallback (D3). Pool-backed ⊆ all is enforced at
 * compile time by KeyedProviderIdIsSubset.
 *
 * Zero-Cost Hydra Router Provider Map (5-Engine Architecture):
 *   Layer 1 (Free Keyed): hf → together → nvidia → replicate
 *   Layer 2 (Free Keyless): pollinations (ultimate fallback)
 *   Layer 3 (Premium): agnes → gemini
 */
import type { ImageProviderId } from "../../shared/env/image-keys.js";

/** Every image provider the orchestrator can route to. */
export const PROVIDER_IDS = ["agnes", "gemini", "hf", "together", "replicate", "nvidia", "pollinations"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** The pool-backed subset (providers holding keys in IMAGE_API_KEYS). */
export type KeyedProviderId = ImageProviderId;

type Assert<T extends true> = T;
/** Compile-time proof: every pool-backed provider is routable. */
export type KeyedProviderIdIsSubset = Assert<KeyedProviderId extends ProviderId ? true : false>;

/** C1 adapter contract: free vs premium cost class of a provider. */
export const PROVIDER_TIERS = ["free", "premium"] as const;
export type ProviderTier = (typeof PROVIDER_TIERS)[number];

/**
 * Normalized provider failure taxonomy (D2). Adapters translate raw HTTP
 * failures (429/402/401/5xx/timeouts) into these kinds; the rotation and
 * circuit-breaker logic keys off `kind`, never raw status codes.
 */
export const PROVIDER_ERROR_KINDS = [
  "rate_limit",
  "quota_exceeded",
  "auth",
  "provider_unavailable",
  "invalid_request",
  "timeout",
  "unknown",
] as const;
export type ProviderErrorKind = (typeof PROVIDER_ERROR_KINDS)[number];

/** A normalized provider failure, ready for rotation logic and metrics. */
export interface ProviderErrorInfo {
  kind: ProviderErrorKind;
  provider: ProviderId;
  /** Server-hinted retry window when the provider supplied one. */
  retryAfterMs?: number;
  /** Original HTTP status for diagnostics (never key material). */
  statusCode?: number;
}
