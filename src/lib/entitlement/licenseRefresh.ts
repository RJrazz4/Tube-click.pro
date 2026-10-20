/**
 * Shared entitlement refresh: re-reads the authoritative referral-profile
 * snapshot (get_referral_dashboard RPC) and reconciles the local license +
 * app tier. Used after a paid activation completes (PaymentCheckout) and by
 * the dashboard referral card (ViralGrowthPass) — one implementation, one
 * source of truth for "what plan am I on".
 */
import { supabase } from "@/integrations/supabase/client";
import { claimReferralAttribution, loadReferralProfile } from "@/lib/referrals/client";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";

export type RefreshResult = "pro" | "free";

/**
 * Reconciles license + app tier from the server. Returns the resulting tier.
 * Throws when there is no session or the profile cannot be loaded.
 */
export async function refreshLicenseFromProfile(): Promise<RefreshResult> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Not signed in");

  await claimReferralAttribution().catch(() => undefined);
  const profile = await loadReferralProfile();

  const { setLicense } = useAuthStore.getState();
  const { setTier } = useAppStore.getState();

  const expiryMs = profile.proTierExpiresAt
    ? new Date(profile.proTierExpiresAt).getTime()
    : NaN;
  if (!Number.isNaN(expiryMs) && expiryMs > Date.now()) {
    setLicense({ tier: "pro", status: "active", expiresAt: profile.proTierExpiresAt ?? undefined });
    setTier("pro");
    return "pro";
  }
  // Preserve lifetime / admin grants: no expiry on file means the backend
  // never revoked it — downgrading here would lie about entitlement.
  const current = useAuthStore.getState().license;
  if (current.tier === "pro" && !current.expiresAt) return "pro";
  setLicense({ tier: "free", status: "active", expiresAt: undefined });
  setTier("free");
  return "free";
}
