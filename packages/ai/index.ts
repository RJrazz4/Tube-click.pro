/**
 * Phase 3+6 — AI Package barrel export
 *
 * Single import path for all AI module consumers:
 *
 * ```ts
 * import { GeneratorOrchestrator, logger, metrics, PollinationsAdapter } from "@/packages/ai";
 * ```
 */

export { GeneratorOrchestrator } from "./generator.js";
export type { GenerationReport, ImageProvenance, GenerateOptions } from "./generator.js";

export { logger } from "./logger.js";
export type { LogEntry, LogLevel } from "./logger.js";

export { metrics } from "./metrics.js";
export type { MetricsSnapshot, ProviderMetrics, MetricEvent } from "./metrics.js";

// Provider adapters
export { AgnesFlashAdapter } from "./providers/agnes-flash-adapter.js";
export { GeminiFlashAdapter } from "./providers/gemini-flash-adapter.js";
export { PollinationsAdapter } from "./providers/pollinations-adapter.js";
export { KeyRotator } from "./providers/key-rotator.js";

export type { ImageProvider } from "./providers/types.js";
export type { GenerateParams, GenerateResult, ProviderMeta } from "./providers/types.js";

export {
  RateLimitError,
  QuotaExceededError,
  ProviderAuthError,
  ProviderUnavailableError,
  AllKeysExhaustedError,
} from "./providers/types.js";
