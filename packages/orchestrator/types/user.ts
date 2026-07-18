/**
 * Phase A3 — User tier (Master Plan F: Business Logic).
 *
 * UserTier is THE business identity for tier enforcement ("free" | "pro" |
 * "cinematic"). It deliberately re-uses the runtime source of truth from
 * A1's TIER_LIMIT_NAMES so env validation, tier limits, and the domain
 * type can never drift apart — the index test pins the sync.
 */
import { TIER_LIMIT_NAMES, type TierLimitName } from "../../shared/env/tier-limits.js";

export type UserTier = TierLimitName;
export const USER_TIERS = TIER_LIMIT_NAMES;
