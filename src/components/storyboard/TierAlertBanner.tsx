/**
 * Phase 5 — TierAlertBanner
 *
 * Displays a prominent alert banner at the top of the Storyboard page
 * indicating the user's current plan limits and an upgrade CTA.
 *
 * Variants:
 *   - "free":    Shows current usage vs limit (e.g. "3 of 4 scenes used") + upgrade CTA
 *   - "premium": Shows a subtle "Premium" badge (no alert needed)
 *   - "limit":   Red/danger banner when the user's scenes exceed the free limit
 *
 * Integrates with:
 *   - Phase 4: tier config from packages/shared/tier.ts
 *   - Phase 5: useTierConfig hook
 */

import { Crown, AlertTriangle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type BannerVariant = "free" | "premium" | "limit";

export interface TierAlertBannerProps {
  /** Which variant to render. */
  variant: BannerVariant;
  /** Number of scenes the user has requested/created. */
  sceneCount: number;
  /** Maximum scenes allowed by the current tier. */
  maxScenes: number;
  /** Optional class name. */
  className?: string;
  /** Called when the user clicks the upgrade CTA. */
  onUpgrade?: () => void;
}

export function TierAlertBanner({
  variant,
  sceneCount,
  maxScenes,
  className,
  onUpgrade,
}: TierAlertBannerProps) {
  if (variant === "premium") {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-purple-500/5 px-4 py-3",
          className
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20">
            <Crown className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-300">Premium Plan Active</p>
            <p className="text-xs text-muted-foreground">
              Unlimited scenes, all brands, high quality, no watermark
            </p>
          </div>
        </div>
        <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
          Premium
        </span>
      </div>
    );
  }

  if (variant === "limit") {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/10 to-orange-500/10 px-4 py-3",
          className
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20">
            <AlertTriangle className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-300">
              Scene limit reached ({maxScenes})
            </p>
            <p className="text-xs text-muted-foreground">
              You have {sceneCount} scenes, but the Free plan allows a maximum of {maxScenes}.
              Unlock Pro for free to access expanded scene limits.
            </p>
          </div>
        </div>
        {onUpgrade && (
          <Button
            size="sm"
            onClick={onUpgrade}
            className="shrink-0 gap-1.5 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Unlock Pro for Free
          </Button>
        )}
      </div>
    );
  }

  // Default: "free" variant — informational with usage meter
  const usagePercent = Math.min(100, Math.round((sceneCount / maxScenes) * 100));
  const isNearLimit = sceneCount >= maxScenes - 1;

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 transition-colors",
        isNearLimit
          ? "border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10"
          : "border-primary/10 bg-gradient-to-r from-primary/5 to-purple-500/5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full",
              isNearLimit ? "bg-amber-500/20" : "bg-primary/20"
            )}
          >
            {isNearLimit ? (
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            ) : (
              <Crown className="h-4 w-4 text-primary" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {isNearLimit ? "Free Plan — near limit" : "Free Plan"}
            </p>
            <p className="text-xs text-muted-foreground">
              {sceneCount} of {maxScenes} scenes used
              {maxScenes < Infinity ? ` — ${maxScenes - sceneCount} remaining` : ""}
            </p>
          </div>
        </div>

        {onUpgrade && (
          <Button
            size="sm"
            variant="outline"
            onClick={onUpgrade}
            className="shrink-0 gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Unlock Pro for Free
          </Button>
        )}
      </div>

      {/* Usage bar */}
      {maxScenes < Infinity && (
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isNearLimit ? "bg-amber-500" : "bg-primary/60"
            )}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
      )}
    </div>
  );
}
