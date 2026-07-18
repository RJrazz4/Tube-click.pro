/**
 * Phase A1 — Tier limits: JSON override deep-merged onto safe defaults.
 *
 * Business model (Master Plan F1):
 *   free:      maxScenes 4,          thumbnailOptions [1, 2]
 *   pro:       maxScenes 8,          thumbnailOptions [1, 2, 4]
 *   cinematic: maxScenes unlimited,  thumbnailOptions [1, 2, 4]
 *
 * TIER_LIMITS='{"free":{"maxScenes":6}}' overrides only what it names.
 * `maxScenes: null` means unlimited. Thumbnail options normalize to a
 * deduped ascending list drawn from [1, 2, 4].
 */
import { z } from "zod";

import type { IssueSink } from "./image-keys.js";

export const THUMBNAIL_OPTION_VALUES = [1, 2, 4] as const;
export type ThumbnailOption = (typeof THUMBNAIL_OPTION_VALUES)[number];

export const TIER_LIMIT_NAMES = ["free", "pro", "cinematic"] as const;
export type TierLimitName = (typeof TIER_LIMIT_NAMES)[number];

export interface ResolvedTierLimit {
  /** Maximum scenes per storyboard generation; null = unlimited. */
  maxScenes: number | null;
  /** Thumbnail count choices offered to this tier. */
  thumbnailOptions: ThumbnailOption[];
}

export type ResolvedTierLimits = Record<TierLimitName, ResolvedTierLimit>;

/** Fresh copy every call — callers may mutate the result safely. */
export function defaultTierLimits(): ResolvedTierLimits {
  return {
    free: { maxScenes: 4, thumbnailOptions: [1, 2] },
    pro: { maxScenes: 8, thumbnailOptions: [1, 2, 4] },
    cinematic: { maxScenes: null, thumbnailOptions: [1, 2, 4] },
  };
}

const thumbnailOptionValue = z.union([z.literal(1), z.literal(2), z.literal(4)]);

const tierLimitOverrideSchema = z
  .object({
    maxScenes: z.union([z.number().int().min(1).max(500), z.null()]).optional(),
    thumbnailOptions: z
      .array(thumbnailOptionValue)
      .min(1)
      .transform((opts) => [...new Set(opts)].sort((a, b) => a - b) as ThumbnailOption[])
      .optional(),
  })
  .strict();

const tierLimitsOverrideSchema = z
  .object({
    free: tierLimitOverrideSchema.optional(),
    pro: tierLimitOverrideSchema.optional(),
    cinematic: tierLimitOverrideSchema.optional(),
  })
  .strict();

/**
 * Pure parser — never throws. Missing/blank input yields the defaults;
 * malformed JSON or schema violations report via `addIssue` and return null.
 */
export function parseTierLimits(
  raw: string | undefined | null,
  addIssue: IssueSink,
): ResolvedTierLimits | null {
  if (raw === undefined || raw === null || raw.trim() === "") return defaultTierLimits();

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    addIssue(`must be valid JSON (${err instanceof Error ? err.message : String(err)})`);
    return null;
  }

  const parsed = tierLimitsOverrideSchema.safeParse(json);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      addIssue(`${path}: ${issue.message}`);
    }
    return null;
  }

  const merged = defaultTierLimits();
  for (const name of TIER_LIMIT_NAMES) {
    const override = parsed.data[name];
    if (!override) continue;
    // `!== undefined` (not truthiness) so an explicit maxScenes:null sticks.
    if (override.maxScenes !== undefined) merged[name].maxScenes = override.maxScenes;
    if (override.thumbnailOptions !== undefined) {
      merged[name].thumbnailOptions = override.thumbnailOptions;
    }
  }
  return merged;
}

/** Zod field for TIER_LIMITS — a missing var is valid and yields defaults. */
export const tierLimitsField = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    const limits = parseTierLimits(raw, (message) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message }),
    );
    return limits ?? z.NEVER;
  });
