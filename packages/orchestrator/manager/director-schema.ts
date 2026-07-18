/**
 * Phase B2 — DirectorOutput Zod schema.
 *
 * Built directly from A3's frozen const arrays so schema and type system
 * can never drift: complexity/aspectRatio/routingHint enums ARE the A3
 * contracts. B4 runs every LLM response through directorOutputSchema
 * before anything routes or generates.
 *
 * Lenient by design against LLM sloppiness: unknown keys are stripped,
 * negativePrompt may be omitted (defaults ""), 1-based scene indices are
 * accepted (B4 re-indexes). Hard-failed: missing core fields, out-of-enum
 * values, zero scenes.
 */
import { z } from "zod";

import { ASPECT_RATIOS, ROUTING_HINTS, SCENE_COMPLEXITIES } from "../types/index.js";

/** Hard ceiling on scenes per storyboard — LLM prompt-injection guard. */
export const MAX_SCENES_PER_STORYBOARD = 24;

export const characterProfileSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  styleGuide: z.string().min(1),
  negativePrompt: z.string().default(""),
});

export const scenePlanSchema = z.object({
  index: z.number().int().min(0),
  title: z.string().min(1),
  prompt: z.string().min(1),
  negativePrompt: z.string().default(""),
  complexity: z.enum(SCENE_COMPLEXITIES),
  aspectRatio: z.enum(ASPECT_RATIOS),
  routingHint: z.enum(ROUTING_HINTS),
});

export const directorOutputSchema = z.object({
  characterProfile: characterProfileSchema.nullable(),
  scenes: z.array(scenePlanSchema).min(1).max(MAX_SCENES_PER_STORYBOARD),
});

export type DirectorOutputParsed = z.infer<typeof directorOutputSchema>;
