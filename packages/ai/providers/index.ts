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

export { AgnesFlashAdapter } from "./agnes-flash-adapter.js";
export { GeminiFlashAdapter } from "./gemini-flash-adapter.js";
export { PollinationsAdapter } from "./pollinations-adapter.js";
export { KeyRotator } from "./key-rotator.js";

export type { ImageProvider } from "./types.js";
export type { GenerateParams, GenerateResult, ProviderMeta } from "./types.js";

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
} from "./types.js";
