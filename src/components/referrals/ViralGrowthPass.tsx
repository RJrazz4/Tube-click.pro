import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Copy, Crown, Download, Gift, Loader2, UserRoundCheck, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { claimReferralAttribution, loadReferralProfile, type ReferralProfile } from "@/lib/referrals/client";
import { buildReferralPromo } from "@/lib/referrals/promo";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";

const MILESTONE_SIZE = 3;

export function ViralGrowthPass() {
  const setLicense = useAuthStore((state) => state.setLicense);
  const license = useAuthStore((state) => state.license);
  const setAppTier = useAppStore((state) => state.setTier);
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out" | "unavailable">("loading");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setStatus("signed-out");
      setProfile(null);
      return;
    }

    setStatus("loading");
    try {
      await claimReferralAttribution().catch(() => undefined);
      const nextProfile = await loadReferralProfile();
      setProfile(nextProfile);
      setStatus("ready");

      if (nextProfile.proTierExpiresAt && new Date(nextProfile.proTierExpiresAt).getTime() > Date.now()) {
        setLicense({ tier: "pro", status: "active", expiresAt: nextProfile.proTierExpiresAt });
        setAppTier("pro");
      } else if (license.tier === "pro" && license.expiresAt) {
        // Referral and admin seed grants are time-bound; clear an expired local grant.
        setLicense({ tier: "free", status: "active", expiresAt: undefined });
        setAppTier("free");
      }
    } catch {
      setStatus("unavailable");
    }
  }, [license.expiresAt, license.tier, setAppTier, setLicense]);

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const referralUrl = profile
    ? `${window.location.origin}/ref/${profile.referralCode}`
    : "";
  const inviteProgress = Math.min(profile?.verifiedReferrals || 0, MILESTONE_SIZE);
  const unlockProgress = Math.min(profile?.friendsUnlockedPro || 0, 1);
  const promotionalInvite = buildReferralPromo(referralUrl);

  const copyInvite = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(promotionalInvite);
      setCopied(true);
      toast.success("Promotional invite copied — ready to share!");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Could not copy the promotional invite");
    }
  };

  return (
    <Card className="relative overflow-hidden border-primary/25 bg-gradient-to-r from-card via-primary/5 to-card shadow-lg">
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
      <CardContent className="relative p-4 md:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5">
              <Gift className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-bold">Viral Growth Pass</h2>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
                  Earn Pro
                </span>
              </div>

              {status === "loading" && (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your referral pass…
                </p>
              )}
              {status === "signed-out" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign in to get your referral toolkit. Invite 3 friends and help one unlock Pro to earn your free 7-Day Pass.
                </p>
              )}
              {status === "unavailable" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Referral rewards are temporarily unavailable. Your existing progress remains safe.
                </p>
              )}
              {status === "ready" && profile && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" /> Friends Invited
                      </span>
                      <span className="font-mono text-primary">{inviteProgress}/3</span>
                    </div>
                    <Progress value={(inviteProgress / 3) * 100} className="h-2" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <UserRoundCheck className="h-3.5 w-3.5" /> Friends Who Unlocked Pro
                      </span>
                      <span className="font-mono text-cyan-400">{unlockProgress}/1</span>
                    </div>
                    <Progress value={unlockProgress * 100} className="h-2 [&>div]:bg-cyan-400" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Invite 3 friends. When one unlocks Pro, <span className="font-medium text-foreground">your free 7-Day Pass activates automatically.</span>
                  </p>
                  <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-primary">
                    <Link to="/rewards">Open Referral Dashboard <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {status === "ready" && profile && (
            <div className="w-full shrink-0 space-y-3 lg:w-[430px]">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1 rounded-lg border border-primary/20 bg-background/50 px-3 py-2 backdrop-blur-md">
                  <p className="truncate font-mono text-xs text-muted-foreground">{referralUrl}</p>
                </div>
                <Button onClick={copyInvite} size="sm" className="cyber-button h-10 shrink-0 gap-1.5 px-4">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy Invite"}
                </Button>
              </div>

              <div className="rounded-xl border border-cyan-400/20 bg-gradient-to-r from-background/60 via-cyan-400/[0.04] to-primary/[0.06] p-3 shadow-[0_0_24px_rgba(34,211,238,0.06)] backdrop-blur-xl">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-display text-xs font-bold uppercase tracking-wider text-cyan-300">Promo Assets</p>
                    <p className="text-[10px] text-muted-foreground">Premium social sharing creative</p>
                  </div>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                    Ready to Post
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-cyan-300/25 bg-secondary shadow-[0_0_18px_rgba(34,211,238,0.12)]">
                    <img
                      src="/referral-banner.png"
                      alt="TubeClick Pro viral growth referral promotion"
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">TubeClick Pro Referral Banner</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                      Download and pair it with your copied invite on social media.
                    </p>
                    <Button variant="outline" size="sm" asChild className="mt-2 h-8 gap-1.5 border-cyan-400/30 bg-cyan-400/5 px-3 text-[11px] hover:border-cyan-300/60 hover:bg-cyan-400/10">
                      <a href="/referral-banner.png" download="tubeclick-pro-referral-banner.png">
                        <Download className="h-3.5 w-3.5" />
                        Download Image
                      </a>
                    </Button>
                  </div>
                </div>
              </div>

              {profile.proTierExpiresAt && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  <Crown className="h-4 w-4" />
                  Pro through {new Date(profile.proTierExpiresAt).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
