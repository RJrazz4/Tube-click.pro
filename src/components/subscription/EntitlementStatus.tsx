import { Clock3, Crown, LockKeyhole, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { isProTier, useLicense } from "@/stores/useAuthStore";

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
        <span className={cn("text-sm font-bold", pro ? "text-primary" : "text-foreground")}>{pro ? "Pro" : "Free"}</span>
        {pro && expiry && <span className="hidden text-[10px] text-muted-foreground sm:inline">until {expiry}</span>}
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
          <p className={cn("font-display text-lg font-bold", pro ? "text-primary" : "text-foreground")}>{pro ? "Pro" : "Free"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pro ? (expiry ? `Pro access active until ${expiry}` : "Pro access active") : "Core creator tools available with a 24-hour package limit"}
          </p>
        </div>
      </div>
      {pro && expiry && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[10px] font-mono text-primary">
          <Clock3 className="h-3 w-3" aria-hidden="true" /> Expires {expiry}
        </span>
      )}
    </div>
  );
}
