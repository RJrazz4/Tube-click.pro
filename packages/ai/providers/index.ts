/**
 * Phase 3 — Provider Adapters barrel export.
 *
 * Re-exports every adapter, the common interface, error types, and
 * the KeyRotator so the Generator Orchestrator and consumers can
 * import from a single path:
 *
 * ```ts
 * import { AgnesFlashAdapter, ImageProvider, GenerateParams } from "@/packages/ai/providers";
 * ```
 */

export { AgnesFlashAdapter } from "./agnes-flash-adapter";
export { GeminiFlashAdapter } from "./gemini-flash-adapter";
export { PollinationsAdapter } from "./pollinations-adapter";
export { KeyRotator } from "./key-rotator";

export type { ImageProvider } from "./types";
export type { GenerateParams, GenerateResult, ProviderMeta } from "./types";

export {
  RateLimitError,
  QuotaExceededError,
  ProviderAuthError,
  ProviderUnavailableError,
  AllKeysExhaustedError,
  isRateLimitError,
  isQuotaExceededError,
  isProviderAuthError,
  isAllKeysExhaustedError,
} from "./types";
