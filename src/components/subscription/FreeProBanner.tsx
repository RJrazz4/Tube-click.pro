/**
 * FreeProBanner — the single reused free-Pro marketing surface (Round 4).
 *
 * Used wherever a purchase surface used to live while FREE_PRO_MODE is on:
 * Settings → Subscription tab, the ProUpgradeModal shell, and the dashboard
 * activation prompt. PaymentCheckout / pricing code is parked, NOT deleted.
 */
import { PartyPopper, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FREE_PRO_HEADLINE,
  FREE_PRO_FEATURES,
} from "@/lib/monetization/freeProMode";
import { openProActivation } from "@/components/leads/ProActivationModal";
import { useLeadSubmitted, useIsAuthenticated } from "@/stores/useAuthStore";

interface FreeProBannerProps {
  compact?: boolean;
  className?: string;
}

export function FreeProBanner({ compact = false, className }: FreeProBannerProps) {
  const isAuthenticated = useIsAuthenticated();
  const leadSubmitted = useLeadSubmitted();
  const active = isAuthenticated && leadSubmitted;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.10] via-transparent to-cyan-400/[0.06]",
        compact ? "p-4" : "p-6",
        className,
      )}
      role="status"
      aria-label={active ? "Pro active, free for everyone" : "Pro is free for everyone"}
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <div className={cn("shrink-0 rounded-xl border border-primary/25 bg-primary/10 p-2.5")}>
          <PartyPopper className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-display font-black", compact ? "text-base" : "text-xl")}>
            {active ? "Your Pro is ACTIVE — FREE for everyone" : FREE_PRO_HEADLINE}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {active
              ? "Every tool unlocked. No payment, no plans — your access never expires during the free-Pro period."
              : "Every tool unlocked — no payment, no plans. Complete your professional details once to activate."}
          </p>
          {!compact && (
            <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {FREE_PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-foreground/90">
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            {!active ? (
              <Button onClick={openProActivation} className="cyber-button gap-2">
                <Zap className="h-4 w-4" /> Activate my FREE Pro
              </Button>
            ) : (
              <p className="text-[11px] font-mono text-primary/80">✓ Activated — all Pro features live</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
