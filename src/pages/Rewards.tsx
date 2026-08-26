import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, Crown, Gift, Loader2, LockKeyhole, ShieldCheck, Sparkles, Users, Terminal, Activity, Cpu, Flame, DollarSign } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { supabase } from "@/integrations/supabase/client";
import { claimReferralAttribution, loadReferralProfile, type ReferralProfile } from "@/lib/referrals/client";
import { buildReferralPromo } from "@/lib/referrals/promo";
import { buildReferralUrl } from "@/lib/domain/canonical";
import { ProExpiryCountdown } from "@/components/referrals/ProExpiryCountdown";
import { ParticleBurst } from "@/components/ui/ParticleBurst";
import { XpGainPopup } from "@/components/ui/XpGainPopup";
import { VideoWallBackground } from "@/components/ui/VideoWallBackground";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";
import { RewardsPanelFallback, RewardsShellSkeleton } from "@/components/referrals/RewardsSkeletons";
import { ChallengeConsistencyBlock } from "@/components/challenge/ChallengeConsistencyBlock";

// Heavy referral sub-components lazy-loaded so the route shell paints
// instantly. These chunks only download after the hero/progress card is
// visible — eliminating the cold-start lag on /rewards navigation.
const ReferralPromoArtifact = lazy(() => import("@/components/referrals/ReferralPromoArtifact").then(m => ({ default: m.ReferralPromoArtifact })));
const ReferralLeaderboardGhost = lazy(() => import("@/components/referrals/ReferralLeaderboardGhost").then(m => ({ default: m.ReferralLeaderboardGhost })));
const GhostStreak = lazy(() => import("@/components/referrals/GhostStreak").then(m => ({ default: m.GhostStreak })));
const ReferralMilestones = lazy(() => import("@/components/referrals/ReferralMilestones").then(m => ({ default: m.ReferralMilestones })));
const ReferralShareActions = lazy(() => import("@/components/referrals/ReferralShareActions").then(m => ({ default: m.ReferralShareActions })));

// In-memory referral-profile cache (module-scoped). Survives across
// remounts of the page within a single session so the dashboard paints
// from cache on the very first render and refetches in the background.
// TTL is 60s — after that we still show cached data but refresh.
const REFERRAL_CACHE_TTL_MS = 60_000;
let profileCache: { profile: ReferralProfile | null; fetchedAt: number } | null = null;

export default function Rewards() {
  const { isAuthLoading, isAuthenticated, requestAuthentication } = useSoftGate();
  const setLicense = useAuthStore((state) => state.setLicense);
  const setAppTier = useAppStore((state) => state.setTier);
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [burst, setBurst] = useState(0);
  const [xpBurst, setXpBurst] = useState(0);

  // Fire a refetch in the background; we don't await it inside effects
  // that synchronously hydrate from cache. Keeps paint instant while
  // the dashboard stays within 60s of truth.
  const backgroundRefetch = useRef<Promise<void> | null>(null);
  const fetchProfile = useCallback(async (opts?: { force?: boolean }): Promise<ReferralProfile | null> => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      profileCache = null;
      return null;
    }
    await claimReferralAttribution().catch(() => undefined);
    return await loadReferralProfile();
  }, []);

  const refresh = useCallback(async () => {
    setLoadError(false);
    try {
      const nextProfile = await fetchProfile({ force: true });
      if (nextProfile) {
        profileCache = { profile: nextProfile, fetchedAt: Date.now() };
        setProfile(nextProfile);
        if (nextProfile.proTierExpiresAt && new Date(nextProfile.proTierExpiresAt).getTime() > Date.now()) {
          setLicense({ tier: "pro", status: "active", expiresAt: nextProfile.proTierExpiresAt });
          setAppTier("pro");
        }
      } else {
        setProfile(null);
      }
    } catch {
      setLoadError(true);
      toast.error("Connection hiccup — your progress is saved. Retrying.");
    } finally {
      setLoading(false);
    }
  }, [fetchProfile, setAppTier, setLicense]);

  // First paint: if we have a fresh cache, render it instantly and only
  // show the spinner on a true cold start. A background refetch keeps
  // the data fresh without blocking the route transition.
  useEffect(() => {
    const cached = profileCache;
    const now = Date.now();
    if (cached && cached.profile && now - cached.fetchedAt < REFERRAL_CACHE_TTL_MS) {
      setProfile(cached.profile);
      setLoading(false);
      // Background refresh to keep cache warm
      if (!backgroundRefetch.current) {
        backgroundRefetch.current = refresh().finally(() => { backgroundRefetch.current = null; });
      }
      return;
    }
    if (!isAuthenticated && !isAuthLoading) { setProfile(null); setLoading(false); return; }
    if (isAuthenticated) void refresh();
  }, [isAuthenticated, isAuthLoading, refresh]);

  useEffect(() => {
    if (profile && (profile.qualifiedReferrals >= profile.requiredForReward || profile.proActive)) {
      // Celebration - only once per session
      try {
        const key = `ghost_celebrated_${profile.referralCode}`;
        if (!sessionStorage.getItem(key)) {
          setBurst(v => v + 1);
          setXpBurst(v => v + 1);
          if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
          sessionStorage.setItem(key, "1");
        }
      } catch { /* eligibility lookup is best-effort */ }
    }
  }, [profile]);

  const referralUrl = profile ? buildReferralUrl(profile.referralCode) : "";
  // 2-Node model: the ONLY gate is qualified referrals (proof-of-work
  // complete). The former second stage — "help 1 invited friend unlock
  // Elite" — was the chain-loop from evaluate_qualified_referral_chain(),
  // which migration 202608140006 dropped. Rendering it kept promising a
  // step the backend no longer has.
  const requiredForReward = profile?.requiredForReward || 2;
  const qualified = profile?.qualifiedReferrals || 0;
  const inviteProgress = Math.min(qualified, requiredForReward);
  const invitePct = requiredForReward > 0 ? Math.round((inviteProgress / requiredForReward) * 100) : 0;
  const rewardDays = profile?.rewardDays || 21;
  const pendingReferrals = profile?.pendingReferrals || 0;

  const copyInvite = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(buildReferralPromo(referralUrl));
      setCopied(true);
      if (navigator.vibrate) navigator.vibrate(20);
      toast.success("Invite link copied — share it to earn Pro free");
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Copy failed"); }
  };

  if (!isAuthLoading && !isAuthenticated && !loading) {
    return (
      <div className="relative mx-auto flex min-h-[65vh] max-w-2xl items-center justify-center">
        <VideoWallBackground intensity="medium" />
        <Card className="relative z-10 w-full overflow-hidden glass-strong border-primary/30 text-center shadow-[0_0_70px_rgba(139,92,246,0.18)] bracket">
          <CardContent className="relative flex flex-col items-center gap-4 p-8 md:p-12">
            <div className="rounded-2xl border border-primary/25 bg-primary/10 p-4"><LockKeyhole className="h-8 w-8 text-primary" /></div>
            <div><h1 className="font-display text-2xl font-black">Earn Pro for Free with Referrals</h1><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Sign in to get your personal invite link and track your progress to Pro in real time. No checkout. No card. Ever.</p></div>
            <Button onClick={() => void requestAuthentication("open your Referral Rewards Dashboard")} className="cyber-button h-11 gap-2 px-6">Sign In to Start Earning Pro <ArrowRight className="h-4 w-4" /></Button>
            <p className="text-[9px] font-mono text-muted-foreground">Progress tracked in real time</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError) return <div className="flex min-h-[60vh] items-center justify-center"><Card className="max-w-md glass-strong border-amber-500/20 text-center"><CardContent className="space-y-3 p-8"><p className="font-display text-lg font-bold flex items-center justify-center gap-2"><Cpu className="w-5 h-5 text-amber-400" />Connection hiccup</p><p className="text-sm text-muted-foreground">Your progress is saved. We could not reach the server — please retry.</p><Button onClick={() => void refresh()} variant="outline">Retry</Button></CardContent></Card></div>;

  if (loading || !profile) return <RewardsShellSkeleton />;

  return (
    <div className="relative mx-auto max-w-6xl space-y-6 animate-fade-in">
      <XpGainPopup trigger={xpBurst} xp={50} label="XP earned" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none z-30">
        <ParticleBurst trigger={burst} />
      </div>
      <div className="relative z-10 space-y-6">
        <ChallengeConsistencyBlock />

        <section className="relative overflow-hidden rounded-3xl glass-strong border-primary/30 p-6 shadow-[0_0_70px_rgba(139,92,246,0.15)] md:p-8 bracket">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 ghost-scanline opacity-[0.03]" />
          <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300"><Crown className="h-3.5 w-3.5" /> Qualified Growth Loop</div>
              <h1 className="font-display text-3xl font-black md:text-4xl">Unlock Pro for <span className="bg-gradient-to-r from-primary to-cyan-300 bg-clip-text text-transparent">₹0</span> <span className="text-lg font-mono font-bold text-muted-foreground line-through decoration-primary/50">$97/mo</span> <span className="text-[11px] font-mono bg-green-500/10 text-green-300 border border-green-500/20 px-2 py-0.5 rounded-full">YOUR PRICE: ₹0 via ghost uplink</span></h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Share your personal invite link. When {requiredForReward} invited creators each complete a real action, {rewardDays} days of Pro activates automatically. No checkout, no card, no subscription.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-full">YOUR INVITE LINK</span>
                <span className="text-[10px] font-mono bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 px-2 py-1 rounded-full">tubeclickpro.in • Canonical • Never Vercel</span>
                <span className="text-[10px] font-mono bg-green-500/10 text-green-300 border border-green-500/20 px-2 py-1 rounded-full">connected • Encrypted</span>
              </div>
            </div>
            <div className={`rounded-2xl border px-5 py-4 backdrop-blur-md min-w-[240px] ${profile.proActive ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-primary/20 bg-background/40 text-muted-foreground"}`}>
              <div className="flex items-center gap-2 text-sm font-bold">{profile.proActive ? <ShieldCheck className="h-5 w-5" /> : <Sparkles className="h-5 w-5 text-primary" />}{profile.proActive ? "Pro unlocked" : "Keep going — Pro is within reach"}</div>
              {profile.proTierExpiresAt ? <div className="mt-2"><ProExpiryCountdown expiresAt={profile.proTierExpiresAt} compact /></div> : <p className="mt-1 text-[10px] font-mono text-primary/60">Progress syncs automatically</p>}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-6">
            <Card className="glass-strong border-primary/20 bracket">
              <CardHeader><CardTitle className="flex items-center gap-2 font-display"><Gift className="h-5 w-5 text-primary" />Your progress to Pro</CardTitle><CardDescription className="flex items-center gap-2 font-mono text-[11px]"><Terminal className="w-3 h-3" />Real actions count — signups alone never unlock</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-2xl border border-border/60 bg-background/35 p-4 backdrop-blur-sm">
                  <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 font-mono text-sm font-bold text-primary">1</span><div><p className="text-sm font-bold flex items-center gap-2">Qualified Referrals <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">PROOF-OF-WORK</span></p><p className="text-[11px] text-muted-foreground font-mono">Counts only after your invite completes a real action • Signups alone never count</p></div></div><span className="font-mono text-lg font-black text-primary">{inviteProgress}/{requiredForReward}</span></div>
                  <div className="font-mono text-[10px] text-muted-foreground mb-1">{`> QUALIFIED [${"█".repeat(inviteProgress)}${"░".repeat(Math.max(requiredForReward - inviteProgress, 0))}] ${invitePct}% • verified`}</div>
                  <Progress value={invitePct} className="h-3" />
                  {pendingReferrals > 0 && <p className="mt-2 text-[11px] font-mono text-muted-foreground">{pendingReferrals} invited{pendingReferrals === 1 ? "" : "s"} signed up but haven&apos;t completed a core action yet — they don&apos;t count until they do.</p>}
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-amber-100">
                  <strong className="flex items-center gap-1.5"><Activity className="w-4 h-4" />How the {requiredForReward}-Node reward works:</strong> Share your private tracker link <span className="font-mono text-cyan-300">tubeclickpro.in/ref/...?clearance=LEVEL4</span>. When <strong>{requiredForReward}</strong> invited creators each complete a real action in the app, you get <strong>{rewardDays} days of Pro</strong> — granted automatically, no checkout, no card. Signing up alone never unlocks it.
                </div>
                {profile.proTierExpiresAt && <ProExpiryCountdown expiresAt={profile.proTierExpiresAt} />}
                <Suspense fallback={<RewardsPanelFallback />}>
                  <ReferralMilestones profile={profile} />
                </Suspense>
              </CardContent>
            </Card>
            <div className="grid md:grid-cols-2 gap-4">
              <Suspense fallback={<RewardsPanelFallback />}><GhostStreak /></Suspense>
              <Suspense fallback={<RewardsPanelFallback />}><ReferralLeaderboardGhost /></Suspense>
            </div>
          </div>

          <Card className="glass-strong border-cyan-400/20 lg:col-span-2 bracket h-fit">
            <CardHeader><CardTitle className="flex items-center gap-2 font-display"><Users className="h-5 w-5 text-cyan-300" />Ghost Invite Toolkit • Classified • $97→₹0</CardTitle><CardDescription className="flex items-center gap-1.5 font-mono text-[11px]"><Cpu className="w-3 h-3" />QR + Private tracker + Matrix artifact • tubeclickpro.in • Ghost cached • Encrypted</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-background/45 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />Your Ghost Uplink (Always tubeclickpro.in • Private Tracker)</p>
                <p className="mt-1 truncate font-mono text-xs text-foreground">{referralUrl}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  
                  
                  
                  <span className="text-[8px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded">$97→₹0</span>
                </div>
              </div>
              <Suspense fallback={<div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><div className="h-11 rounded-md bg-secondary/30 animate-pulse" /><div className="h-11 rounded-md bg-secondary/30 animate-pulse" /></div>}>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Button onClick={copyInvite} className="cyber-button h-11 w-full gap-2 font-mono text-xs"><Copy className="h-4 w-4" />{copied ? "Link copied" : "Copy referral link"}</Button><ReferralShareActions url={referralUrl} /></div>
              </Suspense>
              <Suspense fallback={<RewardsPanelFallback />}>
                <ReferralPromoArtifact referralCode={profile.referralCode} />
              </Suspense>
              <div className="rounded-lg bg-secondary/30 border border-border/40 p-2.5">
                <p className="text-[10px] font-mono font-bold text-primary flex items-center gap-1.5"><DollarSign className="w-3 h-3" />Value Anchor • $100/mo Illusion</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">This holographic keycard looks like it should cost <span className="line-through">$97/mo</span> <span className="text-green-400 font-bold">→ you get it for ₹0</span> via private tracker. QR encodes <span className="text-cyan-300 font-mono">tubeclickpro.in/ref/...?clearance=LEVEL4</span>. Every share spreads ghost node.</p>
                <div className="mt-2 flex items-center gap-2 text-[9px] font-mono">
                  <span className="flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />2,847 Ghost Ops Live</span>
                  <span className="text-border">•</span>
                  <span>connected • Encrypted</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
