/**
 * FounderPlanCard — compact secondary purchase surface (Round 4, owner
 * decision 2026-10-20). The ONLY paid offer live under FREE_PRO_MODE:
 *   Founder Plan — MONTHLY, ₹99/month, struck-through ₹999, 90% OFF badge,
 *   scarcity hook: "🎁 2 Month Offer Only 🎁" (stated 2-month launch
 *   window — no fake countdown timers).
 *
 * The free path stays the primary CTA everywhere (FreeProBanner); this card
 * is secondary ("Supporter bano — ₹99/mo") and never hides the free option.
 * Used in Settings → Subscription and the ProUpgradeModal free state.
 */
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLANS, planPrices } from "@/lib/monetization/pricing";
import { useProUpgrade } from "@/contexts/ProUpgradeContext";

interface FounderPlanCardProps {
  className?: string;
  onAction?: () => void;
}

export function FounderPlanCard({ className, onAction }: FounderPlanCardProps) {
  const { openProUpgrade } = useProUpgrade();
  const plan = PLANS.founder_monthly_99;
  const prices = planPrices(plan);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.08] via-transparent to-primary/[0.05] p-5",
        className,
      )}
      role="region"
      aria-label="Founder Plan offer"
    >
      <div className="pointer-events-none absolute -left-16 -bottom-20 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-300" aria-hidden="true" />
            <h4 className="font-display text-base font-black">Founder Plan</h4>
            <span className="rounded-full border border-green-500/40 bg-green-500/15 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-green-300">
              {prices.offPct}% OFF
            </span>
          </div>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-sm text-muted-foreground line-through">{prices.originalLabel}</span>
            <span className="font-display text-2xl font-black text-foreground">{prices.chargedLabel}</span>
            <span className="text-[11px] text-muted-foreground">/ month</span>
          </p>
          <p className="mt-1 text-xs font-semibold text-amber-200">
            🎁 2 Month Offer Only 🎁
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Pro toh FREE hai — ye plan sirf hamari build ko support karta hai.
            30 days Pro access, manual payment review.
          </p>
        </div>
      </div>
      <Button
        onClick={() => (onAction ? onAction() : openProUpgrade({ defaultTab: "payment", reason: "founder-card" }))}
        className="cyber-button relative mt-4 h-10 w-full gap-2"
      >
        <Crown className="h-4 w-4" /> Supporter bano — ₹99/mo
      </Button>
    </div>
  );
}
