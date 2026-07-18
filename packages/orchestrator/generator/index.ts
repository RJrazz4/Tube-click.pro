/**
 * Phase E — Generator subsystem public surface.
 *   E1 generator-agent → bounded-concurrency batch engine (default 3)
 *   E2 scene-pipeline  → ScenePlan → route → cascade → GenerationResult
 */
export * from "./generator-agent.js";
export * from "./scene-pipeline.js";
