/**
 * Phase 3+6 — AI Package barrel export
 *
 * Single import path for all AI module consumers:
 *
 * ```ts
 * import { GeneratorOrchestrator, logger, metrics, PollinationsAdapter } from "@/packages/ai";
 * ```
 */

export { GeneratorOrchestrator } from "./generator";
export type { GenerationReport, ImageProvenance, GenerateOptions } from "./generator";

export { logger } from "./logger";
export type { LogEntry, LogLevel } from "./logger";

export { metrics } from "./metrics";
export type { MetricsSnapshot, ProviderMetrics, MetricEvent } from "./metrics";

// Provider adapters
export { AgnesFlashAdapter } from "./providers/agnes-flash-adapter";
export { GeminiFlashAdapter } from "./providers/gemini-flash-adapter";
export { PollinationsAdapter } from "./providers/pollinations-adapter";
export { KeyRotator } from "./providers/key-rotator";

export type { ImageProvider } from "./providers/types";
export type { GenerateParams, GenerateResult, ProviderMeta } from "./providers/types";

export {
  RateLimitError,
  QuotaExceededError,
  ProviderAuthError,
  ProviderUnavailableError,
  AllKeysExhaustedError,
} from "./providers/types";
