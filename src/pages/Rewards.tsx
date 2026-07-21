import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Copy, Crown, Download, Gift, Loader2, LockKeyhole, ShieldCheck, Sparkles, UserRoundCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { supabase } from "@/integrations/supabase/client";
import { claimReferralAttribution, loadReferralProfile, type ReferralProfile } from "@/lib/referrals/client";
import { buildReferralPromo } from "@/lib/referrals/promo";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";

export default function Rewards() {
  const { isAuthenticated, requestAuthentication } = useSoftGate();
  const setLicense = useAuthStore((state) => state.setLicense);
  const setAppTier = useAppStore((state) => state.setTier);
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(false);
    try {
      await claimReferralAttribution().catch(() => undefined);
      const nextProfile = await loadReferralProfile();
      setProfile(nextProfile);
      if (nextProfile.proTierExpiresAt && new Date(nextProfile.proTierExpiresAt).getTime() > Date.now()) {
        setLicense({ tier: "pro", status: "active", expiresAt: nextProfile.proTierExpiresAt });
        setAppTier("pro");
      }
    } catch (error) {
      console.error("[rewards] Failed to load referral progress", {
        error,
        message: error instanceof Error ? error.message : String(error),
        authenticated: Boolean(data.session),
        userId: data.session?.user.id,
      });
      setLoadError(true);
      toast.error("Could not load referral progress. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [setAppTier, setLicense]);

  useEffect(() => {
    void refresh();
  }, [isAuthenticated, refresh]);

  const referralUrl = profile ? `${window.location.origin}/ref/${profile.referralCode}` : "";
  const inviteProgress = Math.min(profile?.verifiedReferrals || 0, 3);
  const unlockProgress = Math.min(profile?.friendsUnlockedPro || 0, 1);

  const copyInvite = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(buildReferralPromo(referralUrl));
      setCopied(true);
      toast.success("Promotional invite copied — ready to share!");
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Could not copy your invite");
    }
  };

  if (!isAuthenticated && !loading) {
    return (
      <div className="mx-auto flex min-h-[65vh] max-w-2xl items-center justify-center">
        <Card className="relative w-full overflow-hidden border-primary/30 bg-card/90 text-center shadow-[0_0_70px_rgba(139,92,246,0.18)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <CardContent className="relative flex flex-col items-center gap-4 p-8 md:p-12">
            <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4"><LockKeyhole className="h-8 w-8 text-primary" /></div>
            <div>
              <h1 className="font-display text-2xl font-black">Unlock Pro for Free</h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Sign in to get your unique invite link, growth toolkit, and live qualification progress.</p>
            </div>
            <Button onClick={() => void requestAuthentication("open your Referral Rewards Dashboard")} className="cyber-button h-11 gap-2 px-6">
              Sign In to Start <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="max-w-md border-destructive/30 bg-card/90 text-center">
          <CardContent className="space-y-3 p-8">
            <p className="font-display text-lg font-bold">Referral progress is temporarily unavailable</p>
            <p className="text-sm text-muted-foreground">Your qualification data remains safe. Retry when the connection is restored.</p>
            <Button onClick={() => void refresh()} variant="outline">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !profile) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <section className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-card/95 via-primary/[0.07] to-cyan-400/[0.06] p-6 shadow-[0_0_70px_rgba(139,92,246,0.15)] backdrop-blur-2xl md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
              <Crown className="h-3.5 w-3.5" /> Qualified Growth Loop
            </div>
            <h1 className="font-display text-3xl font-black md:text-4xl">Unlock Pro for <span className="bg-gradient-to-r from-primary to-cyan-300 bg-clip-text text-transparent">₹0</span></h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Complete both steps and the backend activates your 7-Day Pro Pass automatically—no checkout, no card, no subscription.</p>
          </div>
          <div className={`rounded-2xl border px-5 py-4 ${profile.qualified ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-primary/20 bg-background/40 text-muted-foreground"}`}>
            <div className="flex items-center gap-2 text-sm font-bold">
              {profile.qualified ? <ShieldCheck className="h-5 w-5" /> : <Sparkles className="h-5 w-5 text-primary" />}
              {profile.qualified ? "Pro Pass Unlocked" : "Qualification In Progress"}
            </div>
            {profile.proTierExpiresAt && <p className="mt-1 text-[11px]">Active through {new Date(profile.proTierExpiresAt).toLocaleDateString()}</p>}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="cyber-card border-primary/20 bg-card/80 backdrop-blur-xl lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display"><Gift className="h-5 w-5 text-primary" />Your 2-Step Progress</CardTitle>
            <CardDescription>Both conditions must be complete. Signups alone never unlock Pro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 font-mono text-sm font-bold text-primary">1</span><div><p className="text-sm font-bold">Friends Invited</p><p className="text-[11px] text-muted-foreground">Verified creator signups through your link</p></div></div>
                <span className="font-mono text-lg font-black text-primary">{inviteProgress}/3</span>
              </div>
              <Progress value={(inviteProgress / 3) * 100} className="h-3" />
            </div>

            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400/15 font-mono text-sm font-bold text-cyan-300">2</span><div><p className="flex items-center gap-1.5 text-sm font-bold"><UserRoundCheck className="h-4 w-4 text-cyan-300" />Friends Who Unlocked Pro</p><p className="text-[11px] text-muted-foreground">Help one invited friend complete their own loop</p></div></div>
                <span className="font-mono text-lg font-black text-cyan-300">{unlockProgress}/1</span>
              </div>
              <Progress value={unlockProgress * 100} className="h-3 [&>div]:bg-cyan-400" />
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-amber-100">
              <strong>How it works:</strong> Invite 3 friends. When just ONE of them unlocks their Pro access, you both get 7 Days of Premium for FREE! Help them grow to grow yourself.
            </div>
          </CardContent>
        </Card>

        <Card className="cyber-card border-cyan-400/20 bg-card/80 backdrop-blur-xl lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2 font-display"><Users className="h-5 w-5 text-cyan-300" />Invite Toolkit</CardTitle><CardDescription>Everything needed to share your growth chain.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-primary/20 bg-background/45 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your unique link</p><p className="mt-1 truncate font-mono text-xs text-foreground">{referralUrl}</p></div>
            <Button onClick={copyInvite} className="cyber-button h-11 w-full gap-2">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Invite Copied" : "Copy Invite"}</Button>

            <div className="overflow-hidden rounded-2xl border border-cyan-300/25 bg-secondary shadow-[0_0_25px_rgba(34,211,238,0.08)]">
              <img src="/referral-banner.png" alt="TubeClick Pro referral promotion" className="aspect-square w-full object-cover" />
            </div>
            <Button variant="outline" asChild className="h-10 w-full gap-2 border-cyan-400/30 bg-cyan-400/5 hover:bg-cyan-400/10">
              <a href="/referral-banner.png" download="tubeclick-pro-referral-banner.png"><Download className="h-4 w-4" />Download Promo Image</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
