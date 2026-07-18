/**
 * Phase D — Resilience subsystem public surface.
 *   D2 detector          → any failure to cascade verdict
 *   D3 fallback-executor → RoutingDecision cascade → GenerationResult
 */
export * from "./detector.js";
export * from "./fallback-executor.js";
