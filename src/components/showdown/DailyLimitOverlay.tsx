/**
 * DailyLimitOverlay
 *
 * Premium glassmorphism/blur paywall that masks competitor tiles and the
 * Execute button once a free-tier user has burned their 1 Chain-Loop per day.
 *
 * - Live server-synced countdown to the next free asset.
 * - Classified, encrypted visual language (lock + monospace).
 * - Dual CTA: Unlock Pro ₹0 (referrals) → navigates to /rewards.
 * - Rendered absolutely over the content it locks; blocks pointer events.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Crown, ArrowRight, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuotaStore } from "@/stores/useQuotaStore";
import { toast } from "sonner";

function formatCountdown(totalSeconds: number): { h: number; m: number; s: number; label: string } {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return { h, m, s: sec, label: `${pad(h)}h ${pad(m)}m ${pad(sec)}s` };
}

export function DailyLimitOverlay({ variant = "tile" }: { variant?: "tile" | "hero" }) {
  const navigate = useNavigate();
  const remainingSeconds = useQuotaStore((s) => s.remainingSeconds);
  const resetAt = useQuotaStore((s) => s.resetAt);
  const [, forceTick] = useState(0);

  // Local 1s tick for smooth countdown even when the global store ticks.
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const cd = formatCountdown(remainingSeconds);

  const goRewards = () => navigate("/rewards?upsell=clonecrush");
  const shareInvite = async () => {
    const url = `${window.location.origin}/rewards?upsell=clonecrush`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "TubeClick Pro — Unlock Premium Blueprint", text: "One invite away from unlimited Chain-Loops.", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Referral link copied — send it to 3 creator friends to unlock Pro ₹0");
    } catch {
      // Clipboard/share blocked — still route them to Rewards.
      navigate("/rewards?upsell=clonecrush");
    }
  };

  const isHero = variant === "hero";

  return (
    <div
      className={[
        "absolute inset-0 z-30 flex items-center justify-center rounded-xl",
        "bg-gradient-to-br from-black/85 via-[#0b0820]/90 to-black/85 backdrop-blur-md",
        "border border-primary/40 shadow-[0_0_60px_rgba(139,92,246,0.35)_inset,0_0_30px_rgba(34,211,238,0.15)]",
        isHero ? "rounded-2xl p-6" : "p-3",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label="Premium asset locked"
    >
      {/* Scanline + encryption motifs */}
      <div className="pointer-events-none absolute inset-0 ghost-scanline opacity-20 rounded-xl" />
      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-cyan-400/20" />
      <div className="pointer-events-none absolute -top-px left-4 right-4 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

      <div className={["relative flex flex-col items-center text-center gap-2", isHero ? "max-w-sm" : ""].join(" ")}>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
          </span>
          <span className="text-[9px] font-mono tracking-[0.25em] text-amber-300/90 uppercase">Encrypted • LEVEL 4</span>
        </div>

        <div className={[
          "flex items-center justify-center rounded-xl border border-primary/30 bg-black/60",
          isHero ? "h-14 w-14 mt-1" : "h-10 w-10",
        ].join(" ")}>
          <Lock className={isHero ? "h-6 w-6 text-primary" : "h-4 w-4 text-primary"} />
        </div>

        <h3 className={[
          "font-display font-black leading-tight text-balance bg-gradient-to-r from-primary via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent",
          isHero ? "text-lg md:text-xl" : "text-xs",
        ].join(" ")}>
          CLASSIFIED ASSET
        </h3>
        <p className={[
          "font-display font-bold text-foreground",
          isHero ? "text-sm" : "text-[10px]",
        ].join(" ")}>
          Unlock Premium Blueprint
        </p>

        <p className={[
          "text-muted-foreground font-mono",
          isHero ? "text-xs leading-relaxed max-w-xs" : "text-[8px] leading-snug",
        ].join(" ")}>
          Free tier is limited to <span className="text-primary font-bold">1 Chain-Loop per 24h</span>.
          Next free asset unlocks in
        </p>

        <div className={[
          "font-mono font-bold tabular-nums tracking-wider",
          "rounded-md border border-cyan-400/30 bg-black/60 px-2 py-1",
          "text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.25)]",
          isHero ? "text-sm" : "text-[10px]",
        ].join(" ")} aria-live="polite">
          {cd.label}
        </div>
        {resetAt && isHero && (
          <p className="text-[9px] font-mono text-muted-foreground/70">
            Window resets {new Date(resetAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} UTC
          </p>
        )}

        <div className={["grid w-full gap-1.5", isHero ? "grid-cols-1 sm:grid-cols-2 mt-1" : "grid-cols-1 mt-0.5"].join(" ")}>
          <Button
            size="sm"
            onClick={goRewards}
            className={[
              "cyber-button font-display gap-1 whitespace-nowrap h-8",
              isHero ? "text-xs" : "text-[9px] px-2",
            ].join(" ")}
          >
            <Crown className={isHero ? "h-3.5 w-3.5" : "h-3 w-3"} />
            Unlock Pro ₹0
            <ArrowRight className={isHero ? "h-3.5 w-3.5" : "h-3 w-3"} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={shareInvite}
            className={[
              "border-cyan-400/30 bg-cyan-400/5 font-mono gap-1 whitespace-nowrap text-cyan-200 hover:bg-cyan-400/10 hover:text-cyan-100 h-8",
              isHero ? "text-xs" : "text-[9px] px-2",
            ].join(" ")}
          >
            <Share2 className={isHero ? "h-3.5 w-3.5" : "h-3 w-3"} />
            {isHero ? "Share invite" : "Invite"}
          </Button>
        </div>

        <p className={[
          "font-mono text-muted-foreground/60",
          isHero ? "text-[9px]" : "text-[7px]",
        ].join(" ")}>MUM-01 • ENCRYPTED • GHOST PROTOCOL</p>
      </div>
    </div>
  );
}
