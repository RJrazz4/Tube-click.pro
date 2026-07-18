/**
 * Phase F1 — Tier policy: business enforcement over A1's resolved limits.
 *
 * A1 (TIER_LIMITS) owns *configuration* — JSON env override deep-merged
 * onto the plan's defaults. F1 owns *enforcement*: the read-only policy
 * object F2's truncation and F3's endpoints consult for every decision.
 *
 * Plan F1 business model (locked by the conformance test):
 *   free      maxScenes 4          thumbnailOptions [1, 2]
 *   pro       maxScenes 8          thumbnailOptions [1, 2, 4]
 *   cinematic maxScenes unlimited  thumbnailOptions [1, 2, 4]
 *
 * The policy is immutable after construction: the env table is copied
 * defensively, and every getter returns copies — no caller can mutate
 * another request's tier rules.
 */
import {
  defaultTierLimits,
  TIER_LIMIT_NAMES,
  type ResolvedTierLimit,
  type ResolvedTierLimits,
  type ThumbnailOption,
} from "../../shared/env/tier-limits.js";
import type { AppEnv } from "../../shared/env/index.js";
import { USER_TIERS, type UserTier } from "../types/index.js";

/** Rejected thumbnail count — F3 maps this to a 400 with allowed options. */
export class ThumbnailCountNotAllowedError extends Error {
  readonly tier: UserTier;
  readonly requested: number;
  readonly allowed: readonly ThumbnailOption[];

  constructor(tier: UserTier, requested: number, allowed: readonly ThumbnailOption[]) {
    super(
      `tier "${tier}" allows thumbnail counts [${allowed.join(", ")}] — got ${requested}`,
    );
    this.name = "ThumbnailCountNotAllowedError";
    this.tier = tier;
    this.requested = requested;
    this.allowed = [...allowed];
  }
}

/** GET /api/v1/tiers payload row (F3) — JSON-serializable. */
export interface TierCatalogEntry {
  tier: UserTier;
  /** Scene cap per storyboard; null = unlimited. */
  maxScenes: number | null;
  unlimitedScenes: boolean;
  thumbnailOptions: ThumbnailOption[];
}

export class TierPolicy {
  private readonly table: ResolvedTierLimits;

  constructor(limits: ResolvedTierLimits = defaultTierLimits()) {
    // Defensive deep copy: the policy must be immutable after construction.
    this.table = {
      free: { maxScenes: limits.free.maxScenes, thumbnailOptions: [...limits.free.thumbnailOptions] },
      pro: { maxScenes: limits.pro.maxScenes, thumbnailOptions: [...limits.pro.thumbnailOptions] },
      cinematic: {
        maxScenes: limits.cinematic.maxScenes,
        thumbnailOptions: [...limits.cinematic.thumbnailOptions],
      },
    };
  }

  /** Straight off the validated AppEnv (A1). */
  static fromEnv(env: Pick<AppEnv, "tierLimits">): TierPolicy {
    return new TierPolicy(env.tierLimits);
  }

  /** Full limits row for a tier (fresh copy). */
  limits(tier: UserTier): ResolvedTierLimit {
    const row = this.table[tier];
    return { maxScenes: row.maxScenes, thumbnailOptions: [...row.thumbnailOptions] };
  }

  /** Scene cap for a tier; null = unlimited. */
  maxScenes(tier: UserTier): number | null {
    return this.table[tier].maxScenes;
  }

  allowsUnlimitedScenes(tier: UserTier): boolean {
    return this.table[tier].maxScenes === null;
  }

  /** Thumbnail choices offered to this tier (ascending, fresh copy). */
  thumbnailOptions(tier: UserTier): ThumbnailOption[] {
    return [...this.table[tier].thumbnailOptions];
  }

  /** The count clients get when they don't ask — always the cheapest. */
  defaultThumbnailCount(tier: UserTier): ThumbnailOption {
    return this.table[tier].thumbnailOptions[0];
  }

  isThumbnailCountAllowed(tier: UserTier, count: number): boolean {
    return (this.table[tier].thumbnailOptions as number[]).includes(count);
  }

  /**
   * The count F3 will actually generate: the tier default when the client
   * didn't ask; the requested count when allowed; otherwise a loud
   * ThumbnailCountNotAllowedError (never a silent clamp — hidden surprises
   * erode tier trust).
   */
  resolveThumbnailCount(tier: UserTier, requested?: number): ThumbnailOption {
    if (requested === undefined) return this.defaultThumbnailCount(tier);
    const options = this.table[tier].thumbnailOptions;
    const found = options.find((option) => option === requested);
    if (found === undefined) {
      throw new ThumbnailCountNotAllowedError(tier, requested, options);
    }
    return found;
  }

  /** The public tier catalog — F3's GET /api/v1/tiers response body. */
  catalog(): TierCatalogEntry[] {
    // USER_TIERS order (free, pro, cinematic) is locked by A3's index test.
    return USER_TIERS.map((tier) => {
      const row = this.table[tier];
      return {
        tier,
        maxScenes: row.maxScenes,
        unlimitedScenes: row.maxScenes === null,
        thumbnailOptions: [...row.thumbnailOptions],
      };
    });
  }
}

/** Guard: the F1 catalog can never drift from the A1 tier-name source. */
export const TIER_CATALOG_NAMES = TIER_LIMIT_NAMES;
