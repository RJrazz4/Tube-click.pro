import { Clock3, Crown, LockKeyhole, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { isProTier, useLicense } from "@/stores/useAuthStore";
import { ProExpiryCountdown } from "@/components/referrals/ProExpiryCountdown";
import { FREE_PRO_MODE } from "@/lib/monetization/freeProMode";

interface EntitlementStatusProps {
  compact?: boolean;
  className?: string;
}

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Shared, plain-language entitlement display.
 *
 * The backend remains authoritative; this component only presents the
 * reconciled license snapshot already held by the auth store. It deliberately
 * exposes Free/Pro instead of mixing referral, Elite, and Ghost terminology.
 */
export function EntitlementStatus({ compact = false, className }: EntitlementStatusProps) {
  const license = useLicense();
  const pro = isProTier(license);
  const expiry = formatDate(license.expiresAt);
  const expired = Boolean(license.expiresAt) && !pro;
  // NOTE: the entitlement RPC exposes only pro_expires_at (no start date),
  // so timing shows expiry + days remaining — never an invented start date.

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-xl border px-3 py-2",
          pro ? "border-primary/25 bg-primary/10" : "border-border/70 bg-secondary/40",
          className,
        )}
        role="status"
        aria-label={`Current plan: ${pro ? "Pro" : "Free"}`}
      >
        {pro ? <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Plan</span>
        <span className={cn("text-sm font-bold", pro ? "text-primary" : "text-foreground")}>
          {pro ? "Pro" : "Free"}
        </span>
        {FREE_PRO_MODE && pro && (
          <span className="rounded-full border border-green-500/40 bg-green-500/15 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-green-300">
            ACTIVE
          </span>
        )}
        {FREE_PRO_MODE && !pro && (
          <span className="text-[10px] text-muted-foreground">Pro FREE — details bharo, activate karo</span>
        )}
        {pro && expiry && !FREE_PRO_MODE && <span className="hidden text-[10px] text-muted-foreground sm:inline">until {expiry}</span>}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)} role="status" aria-label={`Current plan: ${pro ? "Pro" : "Free"}`}>
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", pro ? "border-primary/25 bg-primary/10" : "border-border/70 bg-secondary/40")}>
          {pro ? <Crown className="h-5 w-5 text-primary" aria-hidden="true" /> : <LockKeyhole className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Current plan</p>
          <p className={cn("font-display text-lg font-bold", pro ? "text-primary" : "text-foreground")}>
            {FREE_PRO_MODE && pro ? "Pro — ACTIVE • FREE for everyone" : pro ? "Pro" : "Free"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {FREE_PRO_MODE
              ? pro
                ? "Sab Pro tools unlocked — koi payment nahi, koi expiry pressure nahi."
                : "Details bharo, Pro FREE pao — professional details submit karte hi Pro activate ho jayega."
              : pro
                ? expiry
                  ? `Pro access active until ${expiry}`
                  : "Pro access active"
                : expired
                  ? "Your Pro access has expired — you are on the Free plan"
                  : "Core creator tools available with a 24-hour package limit"}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono font-bold",
          pro ? "border-green-500/30 bg-green-500/10 text-green-300"
            : expired ? "border-red-500/30 bg-red-500/10 text-red-300"
            : "border-border/70 bg-secondary/40 text-muted-foreground",
        )}>
          <span className={cn("w-1.5 h-1.5 rounded-full", pro ? "bg-green-400 animate-pulse" : expired ? "bg-red-400" : "bg-muted-foreground")} />
          {pro ? "ACTIVE" : expired ? "EXPIRED" : "FREE"}
        </span>
        {/* FREE_PRO_MODE: no expiry countdown pressure. The paid-expiry chip
            only shows outside free mode; a real data-driven date may still
            show for paid accounts when the switch is off. */}
        {pro && expiry && !FREE_PRO_MODE && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-mono text-primary">
            <Clock3 className="h-3 w-3" aria-hidden="true" /> Expires {expiry}
          </span>
        )}
        {pro && license.expiresAt && !FREE_PRO_MODE && (
          <ProExpiryCountdown compact expiresAt={license.expiresAt} />
        )}
      </div>
    </div>
  );
}
