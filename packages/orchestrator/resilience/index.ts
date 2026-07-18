/**
 * Phase D — Resilience subsystem public surface.
 *   D2 detector          → any failure to cascade verdict
 *   D3 fallback-executor → RoutingDecision cascade → GenerationResult
 *   D4 circuit-breaker   → per-provider health with auto-recovery
 */
export * from "./detector.js";
export * from "./fallback-executor.js";
export * from "./circuit-breaker.js";
