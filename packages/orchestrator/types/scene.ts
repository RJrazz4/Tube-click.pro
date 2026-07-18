/**
 * Phase A3 — Scene-level types (Master Plan B: Smart Manager Agent).
 *
 * SceneComplexity is the pivot of the whole system (B3): SIMPLE scenes
 * (backgrounds, skies, objects) route to free providers; COMPLEX scenes
 * (characters, action, detail) route to premium. ScenePlan is one entry
 * of DirectorOutput.scenes — the exact shape B2's strict system prompt
 * forces the manager LLM to emit.
 */

/** B3 classifier output. SCREAMING_CASE matches the plan's vocabulary. */
export const SCENE_COMPLEXITIES = ["SIMPLE", "COMPLEX"] as const;
export type SceneComplexity = (typeof SCENE_COMPLEXITIES)[number];

/** YouTube-centric canvases; 16:9 is the platform default. */
export const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/**
 * Manager's per-scene preference emitted into DirectorOutput. The routing
 * engine (C3) treats it as a hint — health and tier limits still rule.
 */
export const ROUTING_HINTS = ["auto", "prefer-premium", "prefer-free"] as const;
export type RoutingHint = (typeof ROUTING_HINTS)[number];

/** One scene of a storyboard, as planned by the Manager Agent. */
export interface ScenePlan {
  /** 0-based storyboard order; E3 re-sorts results by this. */
  index: number;
  /** Short label for the UI sidebar (G1). */
  title: string;
  /** Full generation prompt (character profile already folded in by the Manager). */
  prompt: string;
  /** Scene-specific negatives; merged with the global profile negatives. */
  negativePrompt: string;
  /** B3 classification — drives routing tier selection. */
  complexity: SceneComplexity;
  aspectRatio: AspectRatio;
  /** Manager's routing preference; "auto" defers fully to C3. */
  routingHint: RoutingHint;
}
