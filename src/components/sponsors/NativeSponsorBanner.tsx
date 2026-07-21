import { ExternalLink, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface NativeSponsorBannerProps {
  sponsorName: string;
  tagline: string;
  offer: string;
  ctaText: string;
  ctaUrl: string;
  badge?: string;
  allowedHosts?: string[];
}

function hasAllowedDestination(value: string, allowedHosts: string[]): boolean {
  try {
    const destination = new URL(value);
    if (destination.protocol !== "https:") return false;
    return allowedHosts.some((host) => destination.hostname === host || destination.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function NativeSponsorBanner({
  sponsorName,
  tagline,
  offer,
  ctaText,
  ctaUrl,
  badge = "Featured Partner",
  allowedHosts = [],
}: NativeSponsorBannerProps) {
  if (!sponsorName.trim() || !hasAllowedDestination(ctaUrl, allowedHosts)) return null;

  return (
    <aside
      aria-label={`Sponsored partnership with ${sponsorName}`}
      className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-card/95 via-secondary/40 to-card/95 p-4 shadow-lg backdrop-blur-xl transition-all duration-300 hover:border-primary/50 md:p-5"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      <Sparkles className="pointer-events-none absolute bottom-3 right-36 h-12 w-12 text-primary/[0.04]" />

      <div className="relative z-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
              <ShieldCheck className="h-3 w-3" /> {badge}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">• {sponsorName}</span>
          </div>
          <p className="font-display text-sm font-bold text-foreground md:text-base">{tagline}</p>
          <p className="text-xs text-muted-foreground">{offer}</p>
        </div>

        <Button variant="outline" size="sm" asChild className="cyber-button h-10 shrink-0 gap-1.5 px-4 font-display text-xs">
          <a href={ctaUrl} target="_blank" rel="sponsored noopener noreferrer">
            <span>{ctaText}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
    </aside>
  );
}
