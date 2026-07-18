/**
 * Phase E — Generator subsystem public surface.
 *   E1 generator-agent → bounded-concurrency batch engine (default 3)
 *   E2 scene-pipeline  → ScenePlan → route → cascade → GenerationResult
 *   E3 storyboard      → results re-sorted by sceneIndex + summary stats
 *   E4 generator-metrics → images/fallbacks/rotations/cost + latency p50-p99
 */
export * from "./generator-agent.js";
export * from "./scene-pipeline.js";
export * from "./storyboard.js";
export * from "./generator-metrics.js";
