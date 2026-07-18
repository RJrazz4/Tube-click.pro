/**
 * Phase H — Observability public surface.
 *   H1 logger    → structured JSON events across the pipeline seams
 *   H2 snapshot  → one assembled read (tracker + breaker + metrics + limiter)
 *   H2 prometheus → text exposition format (v0.0.4)
 *   H2 health    → ok/degraded/down rollup for schedulers
 */
export * from "./logger.js";
export * from "./snapshot.js";
export * from "./prometheus.js";
export * from "./health.js";
