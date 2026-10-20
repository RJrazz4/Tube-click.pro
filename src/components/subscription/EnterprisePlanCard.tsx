/**
 * EnterprisePlanCard — aspirational impossible-tier teaser (Round 5, owner
 * decision 2026-10-20).
 *
 * DELIBERATELY a teaser/anchor, NOT a real offer: there is no checkout, no
 * modal, no purchase path. The CTA is a DISABLED "Coming Soon" button and a
 * matching badge — purely to set the top of the pricing ladder. Styling
 * matches the existing subscription card design system (FounderPlanCard).
 */
import { Building2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EnterprisePlanCardProps {
  className?: string;
}

const ENTERPRISE_FEATURES = [
  "Team workspaces — poori team, ek dashboard",
  "API access — apne tools se seedha jodo",
  "Dedicated growth manager",
  "Unlimited everything — koi cap, koi queue nahi",
];

export function EnterprisePlanCard({ className }: EnterprisePlanCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.10] via-transparent to-fuchsia-400/[0.06] p-5",
        className,
      )}
      role="region"
      aria-label="Enterprise plan teaser"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            <h4 className="font-display text-base font-black tracking-wide">ENTERPRISE</h4>
            <span className="rounded-full border border-primary/40 bg-primary/15 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider text-primary">
              Coming Soon
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Agencies aur bade creator teams ke liye — jab scale chahiye ho,
            sab kuch unlimited.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {ENTERPRISE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs text-foreground/90">
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Button
        disabled
        className="relative mt-4 h-10 w-full gap-2"
        aria-label="Enterprise plan coming soon"
      >
        Coming Soon
      </Button>
    </div>
  );
}
