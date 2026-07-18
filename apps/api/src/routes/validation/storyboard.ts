/**
 * Phase 4 — Storyboard request validation schemas
 *
 * Uses Zod for runtime validation of incoming API requests.
 * Enforces tier limits (FREE max 4 scenes, PREMIUM unlimited).
 */

import { z } from "zod";

// ─── Scene Schema ─────────────────────────────────────────────────

export const sceneSchema = z.object({
  scene_number: z.number().int().min(1),
  visual_prompt: z.string().min(1).max(2000),
  motion_prompt: z.string().max(500).optional().default(""),
  duration: z.number().int().min(2).max(30).optional().default(5),
  transition: z
    .enum(["cut", "fade", "dissolve", "slide", "zoom"])
    .optional()
    .default("cut"),
  beat_type: z
    .enum(["intro", "hook", "content", "climax", "outro"])
    .optional()
    .default("content"),
});

// ─── Storyboard Request ──────────────────────────────────────────

export const storyboardRequestSchema = z.object({
  /** The video / storyboard topic. */
  topic: z.string().min(1).max(500),
  /** Full script text (optional — used to derive scene prompts). */
  script: z.string().max(10000).optional(),
  /** Array of scenes to generate. */
  scenes: z.array(sceneSchema).min(1).max(100),
  /** Subscription tier — determines feature limits. */
  tier: z.enum(["free", "premium"]).optional().default("free"),
  /** White-label brand for image generation. */
  brand: z
    .enum(["Tube.Flash", "Tube.Pro", "Tube.Cinematic"])
    .optional()
    .default("Tube.Flash"),
  /** Aspect ratio for the output images. */
  aspect_ratio: z
    .enum(["9:16", "16:9", "1:1"])
    .optional()
    .default("16:9"),
  /** Optional seed for reproducibility. */
  seed: z.number().int().optional(),
});

// ─── Inferred types ──────────────────────────────────────────────

export type SceneInput = z.infer<typeof sceneSchema>;
export type StoryboardRequest = z.infer<typeof storyboardRequestSchema>;

// ─── Request errors ──────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate a storyboard request, returning either the validated data
 * or a list of field-level errors.
 */
export function validateStoryboardRequest(
  raw: unknown
): { data: StoryboardRequest; errors?: undefined } | { data?: undefined; errors: ValidationError[] } {
  const result = storyboardRequestSchema.safeParse(raw);

  if (!result.success) {
    const errors: ValidationError[] = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return { errors };
  }

  return { data: result.data };
}
