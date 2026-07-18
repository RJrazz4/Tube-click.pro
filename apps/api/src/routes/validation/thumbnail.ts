/**
 * Phase 4 — Thumbnail request validation schemas
 *
 * Validates incoming thumbnail generation requests with tier-based
 * limits on count and brand selection.
 */

import { z } from "zod";

// ─── Thumbnail Request ───────────────────────────────────────────

export const thumbnailRequestSchema = z.object({
  /** Title of the video. */
  title: z.string().min(1).max(300),
  /** Primary emotion to convey. */
  emotion: z.string().min(1).max(100),
  /** Visual style. */
  style: z.string().min(1).max(200),
  /** Aspect ratio. */
  aspect_ratio: z
    .enum(["9:16", "16:9", "1:1", "4:5"])
    .optional()
    .default("16:9"),
  /** Number of thumbnails to generate (1 or 2 for free, up to 4 for premium). */
  count: z.number().int().min(1).max(4).optional().default(4),
  /** Subscription tier. */
  tier: z.enum(["free", "premium"]).optional().default("free"),
  /** White-label brand. */
  brand: z
    .enum(["Tube.Flash", "Tube.Pro", "Tube.Cinematic"])
    .optional()
    .default("Tube.Pro"),
  /** Optional seed. */
  seed: z.number().int().optional(),
});

// ─── Inferred types ──────────────────────────────────────────────

export type ThumbnailRequest = z.infer<typeof thumbnailRequestSchema>;

// ─── Validation helper ───────────────────────────────────────────

import type { ValidationError } from "./storyboard.js";

export function validateThumbnailRequest(
  raw: unknown
): { data: ThumbnailRequest; errors?: undefined } | { data?: undefined; errors: ValidationError[] } {
  const result = thumbnailRequestSchema.safeParse(raw);

  if (!result.success) {
    const errors: ValidationError[] = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return { errors };
  }

  return { data: result.data };
}
