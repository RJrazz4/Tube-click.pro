/**
 * Phase E — Generator subsystem public surface.
 *   E1 generator-agent → bounded-concurrency batch engine (default 3)
 *   E2 scene-pipeline  → ScenePlan → route → cascade → GenerationResult
 *   E3 storyboard      → results re-sorted by sceneIndex + summary stats
 */
export * from "./generator-agent.js";
export * from "./scene-pipeline.js";
export * from "./storyboard.js";
