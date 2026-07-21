import { supabase } from "@/integrations/supabase/client";

export interface ReferralProfile {
  referralCode: string;
  totalInvites: number;
  verifiedReferrals: number;
  friendsUnlockedPro: number;
  qualified: boolean;
  proUnlockedAt: string | null;
  proTierExpiresAt: string | null;
  proUnlockSource: "qualified_loop" | "admin_seed" | null;
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
    verifiedReferrals: Number(profile.verified_referrals || 0),
    friendsUnlockedPro: Number(profile.friends_unlocked_pro || 0),
    qualified: profile.qualified === true,
    proUnlockedAt: typeof profile.pro_unlocked_at === "string" ? profile.pro_unlocked_at : null,
    proTierExpiresAt: typeof profile.pro_tier_expires_at === "string" ? profile.pro_tier_expires_at : null,
    proUnlockSource: profile.pro_unlock_source === "qualified_loop" || profile.pro_unlock_source === "admin_seed"
      ? profile.pro_unlock_source
      : null,
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
