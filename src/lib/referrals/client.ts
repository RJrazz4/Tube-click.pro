import { supabase } from "@/integrations/supabase/client";

/**
 * 2-Node referral profile.
 *
 * Progress only — the dashboard RPC deliberately exposes no anti-abuse state
 * (risk scores, rejection reasons). Surfacing those would tell an attacker
 * which control rejected them.
 */
export interface ReferralProfile {
  referralCode: string;
  totalInvites: number;
  /** Referrals that completed proof-of-work. Only these count toward reward. */
  qualifiedReferrals: number;
  /** Attributed but not yet proven by a core action. */
  pendingReferrals: number;
  /** Qualified referrals needed per reward (2 under the 2-Node model). */
  requiredForReward: number;
  /** Pro days granted per completed milestone (21). */
  rewardDays: number;
  proActive: boolean;
  proTierExpiresAt: string | null;
  /** Server-side one-time free-unlock ledger: true if already consumed. */
  freeUnlockUsed: boolean;
  lifetimeDaysGranted: number;
  lifetimeDayCap: number;
}

interface ReferralResponse {
  success: boolean;
  verified?: boolean;
  reason?: string;
  pro_tier_expires_at?: string;
  profile?: ReferralProfile;
  error?: string;
}

async function referralRequest(
  body: Record<string, unknown>,
  authenticated = false,
): Promise<ReferralResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authenticated) {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error("Authentication required");
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch("/api/referrals", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ error: "Invalid referral response" })) as ReferralResponse;
  if (!response.ok) throw new Error(result.error || "Referral request failed");
  return result;
}

export function captureReferralClick(code: string) {
  return referralRequest({ action: "click", code });
}

export function claimReferralAttribution() {
  return referralRequest({ action: "claim" }, true);
}

function parseReferralProfile(value: unknown): ReferralProfile {
  if (!value || typeof value !== "object") throw new Error("Referral dashboard returned an invalid profile");
  const profile = value as Record<string, unknown>;
  if (typeof profile.referral_code !== "string") throw new Error("Referral dashboard did not return a referral code");

  return {
    referralCode: profile.referral_code,
    totalInvites: Number(profile.total_invites || 0),
    qualifiedReferrals: Number(profile.qualified_referrals || 0),
    pendingReferrals: Number(profile.pending_referrals || 0),
    requiredForReward: Number(profile.required_for_reward || 2),
    rewardDays: Number(profile.reward_days || 21),
    proActive: profile.pro_active === true,
    proTierExpiresAt: typeof profile.pro_expires_at === "string" ? profile.pro_expires_at : null,
    freeUnlockUsed: profile.free_unlock_used === true,
    lifetimeDaysGranted: Number(profile.lifetime_days_granted || 0),
    lifetimeDayCap: Number(profile.lifetime_day_cap || 180),
  };
}

export async function loadReferralProfile(): Promise<ReferralProfile> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Authentication required");

  // Query the self-only RPC directly. This removes the dashboard's dependency
  // on Vercel service-role configuration while the RPC/RLS policy guarantees an
  // authenticated user can retrieve only their own aggregate referral profile.
  const { data, error } = await (supabase as any).rpc("get_referral_dashboard", { p_user_id: userId });
  if (error) {
    console.error("[referrals] get_referral_dashboard RPC failed", {
      userId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message || "Referral dashboard request failed");
  }

  try {
    return parseReferralProfile(data);
  } catch (error) {
    console.error("[referrals] invalid get_referral_dashboard response", { userId, data, error });
    throw error;
  }
}
