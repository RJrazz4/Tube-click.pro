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

export async function loadReferralProfile(): Promise<ReferralProfile> {
  const result = await referralRequest({ action: "profile" }, true);
  if (!result.profile) throw new Error("Referral profile was not returned");
  return result.profile;
}
