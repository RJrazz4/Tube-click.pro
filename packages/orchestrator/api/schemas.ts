/**
 * Phase F3 — Request validation (Zod): the 400 boundary.
 *
 * Everything arriving from the wire is `unknown` until these schemas say
 * otherwise. Failures map to 400 invalid_request with human-readable
 * issue strings; unknown fields are rejected (.strict) so client bugs
 * surface loudly instead of silently doing nothing.
 */
import { z } from "zod";

export const STORYBOARD_SCRIPT_MIN = 10;
export const STORYBOARD_SCRIPT_MAX = 50_000;

export const storyboardRequestSchema = z
  .object({
    /** Full video script the Manager (B4) plans scenes from. */
    script: z.string().trim().min(STORYBOARD_SCRIPT_MIN).max(STORYBOARD_SCRIPT_MAX),
    /** Base reproducibility seed; per-scene seeds derive from it (E2). */
    seed: z.number().int().min(0).optional(),
  })
  .strict();
export type StoryboardRequest = z.infer<typeof storyboardRequestSchema>;

export const THUMBNAIL_PROMPT_MAX = 2_000;

export const thumbnailsRequestSchema = z
  .object({
    /** Thumbnail concept prompt (already art-directed by the caller). */
    prompt: z.string().trim().min(3).max(THUMBNAIL_PROMPT_MAX),
    negativePrompt: z.string().trim().max(THUMBNAIL_PROMPT_MAX).optional(),
    seed: z.number().int().min(0).optional(),
    /** Options to generate; must be one of the tier's choices (F1). */
    count: z.number().int().min(1).max(4).optional(),
  })
  .strict();
export type ThumbnailsRequest = z.infer<typeof thumbnailsRequestSchema>;

/** Flatten a ZodError into "path: message" strings for the 400 details. */
export function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".") || "(body)";
    return `${path}: ${issue.message}`;
  });
}
