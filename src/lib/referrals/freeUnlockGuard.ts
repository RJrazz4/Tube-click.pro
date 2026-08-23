/**
 * Free-Unlock (Ghost Uplink / Referral) eligibility guard.
 *
 * Product rule: the "Free Unlock via Ghost Uplink" referral path is available
 * ONLY to brand-new users and is ONE-TIME only — this prevents the referral
 * system from being farmed to stack free Pro passes.
 *
 * Eligibility = all of:
 *   1. Not already Pro (no active Pro pass).
 *   2. Account is "new" — created within NEW_USER_WINDOW_DAYS of now.
 *   3. This account has never consumed its one-time free unlock
 *      (tracked per-user so it survives reloads but cannot be re-armed).
 *
 * The external referral backend additionally enforces `409 already applied`,
 * so this is defence-in-depth on the client.
 */

import { isProTier, useAuthStore, useLicense } from "@/stores/useAuthStore";

const NEW_USER_WINDOW_DAYS = 7;
const USED_FLAG_PREFIX = "tc:free-unlock-used:";

function usedFlagKey(userId: string | undefined): string | null {
  if (!userId) return null;
  return `${USED_FLAG_PREFIX}${userId}`;
}

function isNewAccount(createdAt?: string | null): boolean {
  if (!createdAt) return true; // unknown creation → treat as eligible, backend is stricter
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return true;
  const ageMs = Date.now() - created;
  return ageMs <= NEW_USER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export interface FreeUnlockEligibility {
  eligible: boolean;
  reason?: "already_pro" | "not_new" | "already_used";
  /** Suggested remediation copy for the ineligible state. */
  message: string;
}

/**
 * Synchronous eligibility check for a given user. Use inside components that
 * already have the license + user snapshot (e.g. via useAuthStore).
 *
 * `serverUsed` cross-checks the authoritative one-time ledger in Supabase
 * (free_unlocks_consumed). When true it overrides the client flag, so clearing
 * localStorage cannot re-arm the free unlock.
 */
export function evaluateFreeUnlockEligibility(args: {
  isPro: boolean;
  userId?: string;
  createdAt?: string | null;
  serverUsed?: boolean;
}): FreeUnlockEligibility {
  if (args.isPro) {
    return {
      eligible: false,
      reason: "already_pro",
      message: "You already have Pro access. The free Ghost Uplink unlock is for new accounts only.",
    };
  }
  if (args.serverUsed) {
    return {
      eligible: false,
      reason: "already_used",
      message: "You've already used your one-time free Ghost Uplink unlock. Choose a payment plan to continue.",
    };
  }
  if (!isNewAccount(args.createdAt)) {
    return {
      eligible: false,
      reason: "not_new",
      message: "The free Ghost Uplink unlock is reserved for new accounts. Upgrade instantly with a one-time payment instead.",
    };
  }
  const key = usedFlagKey(args.userId);
  if (key && localStorage.getItem(key) === "1") {
    return {
      eligible: false,
      reason: "already_used",
      message: "You've already used your one-time free Ghost Uplink unlock. Choose a payment plan to continue.",
    };
  }
  return { eligible: true, message: "" };
}

/** Mark the current account's one-time free unlock as consumed. */
export function markFreeUnlockUsed(userId: string | undefined): void {
  const key = usedFlagKey(userId);
  if (key) {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* storage unavailable — backend remains the source of truth */
    }
  }
}

/** Hook wrapper for convenience in React components. */
export function useFreeUnlockEligibility(serverUsed?: boolean): FreeUnlockEligibility {
  const license = useLicense();
  const isPro = isProTier(license);
  const user = useAuthStore((s) => s.user);
  return evaluateFreeUnlockEligibility({
    isPro,
    userId: user?.id,
    createdAt: user?.createdAt,
    serverUsed,
  });
}
