import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Copy, Crown, Gift, Loader2, UserRoundCheck, Users, Terminal, Cpu, Flame, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { claimReferralAttribution, loadReferralProfile, type ReferralProfile } from "@/lib/referrals/client";
import { buildReferralPromo } from "@/lib/referrals/promo";
import { buildReferralUrl } from "@/lib/domain/canonical";
import { ReferralPromoArtifact } from "@/components/referrals/ReferralPromoArtifact";
import { GhostNodeStatus } from "@/components/ui/GhostNodeStatus";
import { ProExpiryCountdown } from "@/components/referrals/ProExpiryCountdown";
import { ReferralLeaderboardGhost } from "@/components/referrals/ReferralLeaderboardGhost";
import { GhostStreak } from "@/components/referrals/GhostStreak";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";

const MILESTONE_SIZE = 3;

function TerminalProgress({ value, total, label }: { value: number; total: number; label: string }) {
  const percent = Math.round((value / total) * 100);
  const filled = Math.round((value / total) * 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return (
    <div className="font-mono text-[10px]">
      <div className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span className="text-primary font-bold">{bar} {percent}%</span></div>
    </div>
  );
}

export function ViralGrowthPass() {
  const setLicense = useAuthStore((state) => state.setLicense);
  const license = useAuthStore((state) => state.license);
  const setAppTier = useAppStore((state) => state.setTier);
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "signed-out" | "unavailable">("loading");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setStatus("signed-out"); setProfile(null); return; }
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
        setLicense({ tier: "free", status: "active", expiresAt: undefined });
        setAppTier("free");
      }
    } catch { setStatus("unavailable"); }
  }, [license.expiresAt, license.tier, setAppTier, setLicense]);

  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const referralUrl = profile ? buildReferralUrl(profile.referralCode) : "";
  const inviteProgress = Math.min(profile?.verifiedReferrals || 0, MILESTONE_SIZE);
  const unlockProgress = Math.min(profile?.friendsUnlockedPro || 0, 1);
  const promotionalInvite = buildReferralPromo(referralUrl);

  const copyInvite = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(promotionalInvite);
      setCopied(true);
      // Lightweight confetti illusion via toast + vibration
      if (navigator.vibrate) navigator.vibrate(20);
      toast.success("Ghost uplink copied - QR + private tracker invite ready! MUM-01 synced");
      window.setTimeout(() => setCopied(false), 2000);
    } catch { toast.error("Copy failed - ghost relay interference"); }
  };

  return (
    <Card className="relative overflow-hidden glass-strong border-primary/20 shadow-[0_0_40px_rgba(139,92,246,0.15)] bracket">
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute inset-0 ghost-scanline opacity-[0.03] pointer-events-none" />
      <CardContent className="relative p-4 md:p-5">
        {/* Header with value anchor */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5"><Gift className="h-5 w-5 text-primary" /></div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-base font-bold">Viral Growth Pass • Ghost Protocol</h2>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">Elite • ₹0 <span className="line-through text-muted-foreground/60">$97</span></span>
                <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[8px] font-mono font-bold text-green-300 hidden md:inline-flex">MUM-01 • SECURE • tubeclickpro.in</span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <GhostNodeStatus compact />
                <span className="text-[9px] font-mono text-primary/50 flex items-center gap-1"><DollarSign className="w-3 h-3" />ELITE VALUE $97/mo → Your price ₹0 via ghost uplink • No checkout</span>
              </div>
            </div>
          </div>
          <span className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground"><Terminal className="w-3 h-3" /> LEVEL 4 • PRIVATE TRACKER</span>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {status === "loading" && <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing ghost uplink via MUM-01 quantum cache...</p>}
            {status === "signed-out" && <p className="mt-1 text-xs text-muted-foreground">Sign in to get your ghost keycard (holographic + QR). Invite 3 nodes, help 1 unlock Elite → 7-Day Pass via ghost relay. No card. Ever. tubeclickpro.in</p>}
            {status === "unavailable" && <p className="mt-1 text-xs text-muted-foreground">Ghost mesh rerouting - your progress safe in quantum cache (30m). Retry via MUM-01 relay.</p>}
            {status === "ready" && profile && (
              <>
                <div className="space-y-3 rounded-xl border border-border/40 bg-card/40 p-3.5 backdrop-blur-sm">
                  <div className="flex items-center justify-between"><p className="text-xs font-bold font-mono flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-primary" /> SYNC NODES • Friends Invited</p><span className="text-[11px] font-mono font-bold text-primary">{inviteProgress}/3</span></div>
                  <TerminalProgress value={inviteProgress} total={3} label={`> GHOST SYNC [${inviteProgress}/3] • MUM-01 ENCRYPTED`} />
                  <Progress value={(inviteProgress / 3) * 100} className="h-2" />
                  <div className="flex items-center justify-between mt-3"><p className="text-xs font-bold font-mono flex items-center gap-1.5"><UserRoundCheck className="w-3.5 h-3.5 text-cyan-300" /> ELITE NODES • Pro Unlocks</p><span className="text-[11px] font-mono font-bold text-cyan-300">{unlockProgress}/1</span></div>
                  <TerminalProgress value={unlockProgress} total={1} label={`> ELITE UNLOCK [${unlockProgress}/1] • GHOST RELAY MUM-01`} />
                  <Progress value={unlockProgress * 100} className="h-2 [&>div]:bg-cyan-400" />
                  <p className="text-[11px] text-muted-foreground mt-2">Establish 3-node private tracker uplink via <span className="text-cyan-300 font-mono">tubeclickpro.in/ref/...?clearance=LEVEL4</span>. When 1 node unlocks Elite, your 7-Day Pass auto-activates via ghost relay - no checkout, no card, ever. Value anchor: <span className="text-foreground line-through">$97/mo</span> <span className="text-green-400 font-bold">→ ₹0</span></p>
                  <div className="flex items-center gap-2 mt-2">
                    <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-primary"><Link to="/rewards">Open War Room • Live Intel <ArrowRight className="h-3.5 w-3.5" /></Link></Button>
                    <span className="text-[9px] font-mono text-muted-foreground flex items-center gap-1"><Cpu className="w-3 h-3" /> Quantum cache 87ms • Encrypted • Ghost mesh 3 nodes</span>
                  </div>
                </div>

                <GhostStreak />
                {profile.proTierExpiresAt && <ProExpiryCountdown expiresAt={profile.proTierExpiresAt} />}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ReferralLeaderboardGhost />
                  <div className="rounded-xl glass-strong border-cyan-400/15 p-3 flex flex-col justify-center">
                    <p className="text-[11px] font-mono font-bold text-cyan-300 flex items-center gap-1.5"><Flame className="w-3 h-3" /> Ghost Streak Bonus</p>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">Daily visit = +20 XP • 7 day streak = Veteran badge • Keep ghost mesh warm. Zero API cost, pure localStorage dopamine loop.</p>
                    <p className="text-[9px] font-mono text-primary/50 mt-2">tubeclickpro.in • Always canonical • Private tracker illusion</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {status === "ready" && profile && (
            <div className="w-full shrink-0 space-y-3 lg:w-[460px]">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1 rounded-lg border border-primary/20 bg-background/50 px-3 py-2 backdrop-blur-md">
                  <p className="truncate font-mono text-[11px] text-foreground">{referralUrl}</p>
                  <p className="text-[8px] font-mono text-primary/60 mt-0.5 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />tubeclickpro.in • LEVEL 4 • MUM-01 • Encrypted • Private tracker</p>
                </div>
                <Button onClick={copyInvite} size="sm" className="cyber-button h-[52px] shrink-0 gap-1.5 px-4 font-mono text-xs">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Ghost Copied!" : "Copy Ghost Uplink"}
                </Button>
              </div>

              <div className="rounded-xl border border-cyan-400/20 bg-gradient-to-r from-background/60 via-cyan-400/[0.04] to-primary/[0.06] p-3 shadow-[0_0_24px_rgba(34,211,238,0.06)] backdrop-blur-xl">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div><p className="font-display text-xs font-bold uppercase tracking-wider text-cyan-300">Ghost Keycard • Classified • $97 → ₹0 Illusion</p><p className="text-[10px] text-muted-foreground">Holographic + QR + Matrix rain • Private tracker • Auto SVG/PNG</p></div>
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">Elite Artifact</span>
                </div>
                <ReferralPromoArtifact referralCode={profile.referralCode} />
                <p className="text-[10px] text-muted-foreground mt-2 text-center font-mono">Hover → SVG/PNG download • QR encodes <span className="text-cyan-300">tubeclickpro.in/ref/...?clearance=LEVEL4</span> • Matrix rain canvas lightweight</p>
              </div>

              {profile.proTierExpiresAt && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 font-mono">
                  <Crown className="h-4 w-4" />Pro active until {new Date(profile.proTierExpiresAt).toLocaleDateString()} • Ghost node MUM-01 • Live countdown active
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
