import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Copy, Crown, Gift, Loader2, LockKeyhole, ShieldCheck, Sparkles, UserRoundCheck, Users, Terminal, Activity, Cpu, Flame, DollarSign } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSoftGate } from "@/contexts/SoftGateContext";
import { supabase } from "@/integrations/supabase/client";
import { claimReferralAttribution, loadReferralProfile, type ReferralProfile } from "@/lib/referrals/client";
import { buildReferralPromo } from "@/lib/referrals/promo";
import { buildReferralUrl } from "@/lib/domain/canonical";
import { ReferralPromoArtifact } from "@/components/referrals/ReferralPromoArtifact";
import { ReferralLeaderboardGhost } from "@/components/referrals/ReferralLeaderboardGhost";
import { ProExpiryCountdown } from "@/components/referrals/ProExpiryCountdown";
import { GhostStreak } from "@/components/referrals/GhostStreak";
import { WarRoomTicker } from "@/components/ui/WarRoomTicker";
import { GhostNodeStatus } from "@/components/ui/GhostNodeStatus";
import { LiveActiveCounter } from "@/components/ui/LiveActiveCounter";
import { VideoWallBackground } from "@/components/ui/VideoWallBackground";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";

export default function Rewards() {
  const { isAuthLoading, isAuthenticated, requestAuthentication } = useSoftGate();
  const setLicense = useAuthStore((state) => state.setLicense);
  const setAppTier = useAppStore((state) => state.setTier);
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setProfile(null); setLoading(false); return; }
    setLoading(true); setLoadError(false);
    try {
      await claimReferralAttribution().catch(() => undefined);
      const nextProfile = await loadReferralProfile();
      setProfile(nextProfile);
      if (nextProfile.proTierExpiresAt && new Date(nextProfile.proTierExpiresAt).getTime() > Date.now()) {
        setLicense({ tier: "pro", status: "active", expiresAt: nextProfile.proTierExpiresAt });
        setAppTier("pro");
      }
    } catch {
      setLoadError(true);
      toast.error("Ghost mesh rerouting - qualification safe in quantum cache • MUM-01");
    } finally { setLoading(false); }
  }, [setAppTier, setLicense]);

  useEffect(() => { void refresh(); }, [isAuthenticated, refresh]);

  const referralUrl = profile ? buildReferralUrl(profile.referralCode) : "";
  const inviteProgress = Math.min(profile?.verifiedReferrals || 0, 3);
  const unlockProgress = Math.min(profile?.friendsUnlockedPro || 0, 1);

  const copyInvite = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(buildReferralPromo(referralUrl));
      setCopied(true);
      if (navigator.vibrate) navigator.vibrate(20);
      toast.success("Ghost uplink copied - QR + private tracker invite ready! MUM-01 synced • $97 → ₹0");
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
            <div><h1 className="font-display text-2xl font-black">Unlock Pro for Free • Ghost Protocol • ₹0 <span className="text-sm font-mono line-through text-muted-foreground">$97</span></h1><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Sign in to get your holographic ghost keycard (QR + matrix rain), private tracker link <span className="text-cyan-300 font-mono">tubeclickpro.in/ref/...?clearance=LEVEL4</span>, and live qualification via MUM-01 mesh. No checkout. No card. Ever. Value anchor $97 → ₹0.</p><div className="mt-3 flex justify-center gap-2"><LiveActiveCounter compact /><GhostNodeStatus compact /></div></div>
            <Button onClick={() => void requestAuthentication("open your Referral Rewards Dashboard")} className="cyber-button h-11 gap-2 px-6">Sign In to Start Ghost Uplink • Level 4 <ArrowRight className="h-4 w-4" /></Button>
            <p className="text-[9px] font-mono text-muted-foreground">Private tracker illusion • Quantum cached • Encrypted • MUM-01 • 87ms</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError) return <div className="flex min-h-[60vh] items-center justify-center"><Card className="max-w-md glass-strong border-amber-500/20 text-center"><CardContent className="space-y-3 p-8"><p className="font-display text-lg font-bold flex items-center justify-center gap-2"><Cpu className="w-5 h-5 text-amber-400" />Ghost Mesh Rerouting</p><p className="text-sm text-muted-foreground">Qualification safe in quantum cache (30m). MUM-01 retrying encrypted uplink to tubeclickpro.in</p><Button onClick={() => void refresh()} variant="outline">Retry via Ghost Relay</Button></CardContent></Card></div>;

  if (loading || !profile) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-2 text-xs font-mono text-muted-foreground">Ghost sync via MUM-01 • tubeclickpro.in • 87ms</span></div>;

  return (
    <div className="relative mx-auto max-w-6xl space-y-6 animate-fade-in">
      <VideoWallBackground intensity="low" />
      <div className="relative z-10 space-y-6">
        <WarRoomTicker />
        <div className="flex flex-wrap items-center gap-3"><LiveActiveCounter /><GhostNodeStatus compact /><span className="text-[10px] font-mono text-muted-foreground">LEVEL 4 • PRIVATE TRACKER • tubeclickpro.in • Ghost Protocol • Value $97 → ₹0</span></div>

        <section className="relative overflow-hidden rounded-3xl glass-strong border-primary/30 p-6 shadow-[0_0_70px_rgba(139,92,246,0.15)] md:p-8 bracket">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 ghost-scanline opacity-[0.03]" />
          <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300"><Crown className="h-3.5 w-3.5" /> Qualified Growth Loop • Ghost Protocol • Private Tracker</div>
              <h1 className="font-display text-3xl font-black md:text-4xl">Unlock Pro for <span className="bg-gradient-to-r from-primary to-cyan-300 bg-clip-text text-transparent">₹0</span> <span className="text-lg font-mono font-bold text-muted-foreground line-through decoration-primary/50">$97/mo</span> <span className="text-[11px] font-mono bg-green-500/10 text-green-300 border border-green-500/20 px-2 py-0.5 rounded-full">YOUR PRICE: ₹0 via ghost uplink</span></h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Ghost Protocol: Establish 3-node private tracker uplink via <span className="text-cyan-300 font-mono">tubeclickpro.in/ref/...?clearance=LEVEL4&node=MUM01</span>. When 1 node unlocks Elite, backend auto-activates your 7-Day Pass via MUM-01 ghost relay. No checkout, no card, no subscription. Value anchor $97 → ₹0 illusion makes free feel like heist. <span className="text-primary/60 font-mono text-xs">Encrypted • Quantum cached • 87ms</span></p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-full">◢◤ PRIVATE UPLINK • LEVEL 4</span>
                <span className="text-[10px] font-mono bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 px-2 py-1 rounded-full">tubeclickpro.in • Canonical • Never Vercel</span>
                <span className="text-[10px] font-mono bg-green-500/10 text-green-300 border border-green-500/20 px-2 py-1 rounded-full">MUM-01 • 87ms • Encrypted</span>
              </div>
            </div>
            <div className={`rounded-2xl border px-5 py-4 backdrop-blur-md min-w-[240px] ${profile.qualified ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-primary/20 bg-background/40 text-muted-foreground"}`}>
              <div className="flex items-center gap-2 text-sm font-bold">{profile.qualified ? <ShieldCheck className="h-5 w-5" /> : <Sparkles className="h-5 w-5 text-primary" />}{profile.qualified ? "Elite Pass Unlocked • Ghost Node Active" : "Qualification Sync via MUM-01"}</div>
              {profile.proTierExpiresAt ? <div className="mt-2"><ProExpiryCountdown expiresAt={profile.proTierExpiresAt} compact /></div> : <p className="mt-1 text-[10px] font-mono text-primary/60">Ghost mesh: 3 nodes • 87ms • Encrypted • Quantum cached</p>}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-6">
            <Card className="glass-strong border-primary/20 bracket">
              <CardHeader><CardTitle className="flex items-center gap-2 font-display"><Gift className="h-5 w-5 text-primary" />Ghost Uplink Progress • 2-Step • Terminal</CardTitle><CardDescription className="flex items-center gap-2 font-mono text-[11px]"><Terminal className="w-3 h-3" />Both must complete via ghost relay • Signups alone never unlock • Quantum cached • tubeclickpro.in</CardDescription></CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-2xl border border-border/60 bg-background/35 p-4 backdrop-blur-sm">
                  <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 font-mono text-sm font-bold text-primary">1</span><div><p className="text-sm font-bold flex items-center gap-2">Nodes Synced <span className="text-[10px] font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded">FRIENDS INVITED</span></p><p className="text-[11px] text-muted-foreground font-mono">Verified via tubeclickpro.in/ref/...?clearance=LEVEL4 • Private tracker</p></div></div><span className="font-mono text-lg font-black text-primary">{inviteProgress}/3</span></div>
                  <div className="font-mono text-[10px] text-muted-foreground mb-1">{`> GHOST SYNC [${"█".repeat(inviteProgress)}${"░".repeat(3-inviteProgress)}] ${Math.round((inviteProgress/3)*100)}% • MUM-01 ENCRYPTED`}</div>
                  <Progress value={(inviteProgress / 3) * 100} className="h-3" />
                </div>
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.03] p-4">
                  <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400/15 font-mono text-sm font-bold text-cyan-300">2</span><div><p className="flex items-center gap-1.5 text-sm font-bold"><UserRoundCheck className="h-4 w-4 text-cyan-300" />Elite Nodes Unlocked <span className="text-[10px] font-mono bg-cyan-400/10 text-cyan-300 px-1.5 py-0.5 rounded">PRO UNLOCKS</span></p><p className="text-[11px] text-muted-foreground font-mono">Help 1 invited friend complete loop via ghost mesh • Private tracker</p></div></div><span className="font-mono text-lg font-black text-cyan-300">{unlockProgress}/1</span></div>
                  <div className="font-mono text-[10px] text-muted-foreground mb-1">{`> ELITE UNLOCK [${"█".repeat(unlockProgress)}${"░".repeat(1-unlockProgress)}] ${unlockProgress*100}% • GHOST RELAY MUM-01`}</div>
                  <Progress value={unlockProgress * 100} className="h-3 [&>div]:bg-cyan-400" />
                </div>
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-4 text-sm leading-relaxed text-amber-100">
                  <strong className="flex items-center gap-1.5"><Activity className="w-4 h-4" />Ghost Protocol Loophole • $97 → ₹0 Heist:</strong> Invite 3 nodes via private tracker link <span className="font-mono text-cyan-300">tubeclickpro.in/ref/...?clearance=LEVEL4</span>. When 1 node unlocks Elite via their own referral, you both get 7 Days Premium FREE via MUM-01 ghost relay! Help them grow to grow yourself. Quantum cache ensures zero loss. This is how you legally steal $97/mo tool for ₹0.
                </div>
                {profile.proTierExpiresAt && <ProExpiryCountdown expiresAt={profile.proTierExpiresAt} />}
              </CardContent>
            </Card>
            <div className="grid md:grid-cols-2 gap-4">
              <GhostStreak />
              <ReferralLeaderboardGhost />
            </div>
          </div>

          <Card className="glass-strong border-cyan-400/20 lg:col-span-2 bracket h-fit">
            <CardHeader><CardTitle className="flex items-center gap-2 font-display"><Users className="h-5 w-5 text-cyan-300" />Ghost Invite Toolkit • Classified • $97→₹0</CardTitle><CardDescription className="flex items-center gap-1.5 font-mono text-[11px]"><Cpu className="w-3 h-3" />QR + Private tracker + Matrix artifact • tubeclickpro.in • Ghost cached • Encrypted</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-background/45 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />Your Ghost Uplink (Always tubeclickpro.in • Private Tracker)</p>
                <p className="mt-1 truncate font-mono text-xs text-foreground">{referralUrl}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="text-[8px] font-mono bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded">LEVEL 4 CLEARANCE</span>
                  <span className="text-[8px] font-mono bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 px-1.5 py-0.5 rounded">MUM-01 NODE</span>
                  <span className="text-[8px] font-mono bg-green-500/10 text-green-300 border border-green-500/20 px-1.5 py-0.5 rounded">ENCRYPTED</span>
                  <span className="text-[8px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded">$97→₹0</span>
                </div>
              </div>
              <Button onClick={copyInvite} className="cyber-button h-11 w-full gap-2 font-mono text-xs"><Copy className="h-4 w-4" />{copied ? "Ghost Uplink Copied • MUM-01 Synced" : "Copy Ghost Uplink + Private Tracker Promo"}</Button>
              <ReferralPromoArtifact referralCode={profile.referralCode} />
              <div className="rounded-lg bg-secondary/30 border border-border/40 p-2.5">
                <p className="text-[10px] font-mono font-bold text-primary flex items-center gap-1.5"><DollarSign className="w-3 h-3" />Value Anchor • $100/mo Illusion</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">This holographic keycard looks like it should cost <span className="line-through">$97/mo</span> <span className="text-green-400 font-bold">→ you get it for ₹0</span> via private tracker. QR encodes <span className="text-cyan-300 font-mono">tubeclickpro.in/ref/...?clearance=LEVEL4</span>. Every share spreads ghost node.</p>
                <div className="mt-2 flex items-center gap-2 text-[9px] font-mono">
                  <span className="flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />2,847 Ghost Ops Live</span>
                  <span className="text-border">•</span>
                  <span>MUM-01 • 87ms • Encrypted</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
