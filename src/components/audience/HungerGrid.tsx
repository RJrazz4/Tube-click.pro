import { Lock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { AudienceProfile } from "@/lib/engine/types";

/**
 * The Hunger grid — evidence cards from the deterministic engine.
 * Free tier: exactly 3 cards + a locked rail (the upsell surface).
 */
function evidenceLine(label: string, value: string | number | undefined, suffix = ""): string | null {
  if (value === undefined || value === null) return null;
  return `${label} ${value}${suffix}`;
}

export function HungerGrid({ profile, onGenerate }: { profile: AudienceProfile; onGenerate?: (topic: string) => void }) {
  const cards = profile.hungers ?? [];
  const locked = profile.lockedHungerCount ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> What your audience is hungry for
        </h3>
        <span className="text-[9px] font-mono text-primary/60">
          {profile.freshness === "fresh" ? "FRESH • 28-DAY WINDOW" : `${profile.freshness.toUpperCase()} DATA`}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((h, i) => {
          const ev = [
            evidenceLine("watch share", h.evidence?.watch_share_pct, "%"),
            evidenceLine("engagement", h.evidence ? Number(h.evidence.engagement_rate ?? 0) * 100 : undefined, "%"),
            evidenceLine("hook retention", h.evidence ? Number(h.evidence.hook_retention ?? 0) * 100 : undefined, "%"),
            h.evidence && Number(h.evidence.supply_videos_90d ?? 0) === 0
              ? "0 videos in 90 days — pure gap"
              : evidenceLine("supply", h.evidence?.supply_videos_90d, " videos/90d"),
          ].filter(Boolean) as string[];
          return (
            <Card
              key={h.topic}
              className={cn("glass-strong border-border bracket", i === 0 && "border-primary/50 ring-1 ring-primary/20")}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-semibold text-foreground leading-tight">#{h.rank} {h.topic}</p>
                  <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
                    {(h.score * 100).toFixed(0)}
                  </span>
                </div>
                <ul className="space-y-1">
                  {ev.map((line) => (
                    <li key={line} className="text-[11px] font-mono text-muted-foreground">• {line}</li>
                  ))}
                </ul>
                {onGenerate && (
                  <Button size="sm" variant="outline" className="w-full" onClick={() => onGenerate(h.topic)}>
                    Script this hunger
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}

        {locked > 0 && (
          <Card className="border-dashed border-border/70 bg-card/30">
            <CardContent className="p-4 space-y-2 flex flex-col items-center justify-center text-center min-h-[140px]">
              <Lock className="w-5 h-5 text-muted-foreground/60" />
              <p className="text-sm font-semibold text-muted-foreground">{locked} more hunger{locked > 1 ? "s" : ""} locked</p>
              <p className="text-[11px] text-muted-foreground/70">Full retention analysis + AI scripts with Pro</p>
              <Button asChild size="sm" className="font-semibold">
                <Link to="/rewards">See Pro options</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {profile.upsell && (
        <p className="text-xs text-muted-foreground italic">{profile.upsell.message}</p>
      )}
    </div>
  );
}
