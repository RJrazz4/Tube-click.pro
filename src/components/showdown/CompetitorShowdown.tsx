import { BarChart3, Radar } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useCloneCrushStore } from "@/stores/useCloneCrushStore";
import { CompetitorDataGrid } from "./CompetitorDataGrid";
import { NicheDonutChart } from "./NicheDonutChart";
import { ThreatLevelGauge } from "./ThreatLevelGauge";
import { VelocityBarChart } from "./VelocityBarChart";

export function CompetitorShowdown() {
  const competitors = useCloneCrushStore((state) => state.competitors);
  const envyMetrics = useCloneCrushStore((state) => state.envyMetrics);

  if (competitors.length === 0) {
    return (
      <Card className="cyber-card border-dashed border-border">
        <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-2xl bg-primary/10 p-4">
            <Radar className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">No competitors profiled yet</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Analyze a YouTube channel in Clone &amp; Crush to compare public signals and find content opportunities.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-4 animate-fade-in" aria-labelledby="showdown-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="showdown-heading" className="flex items-center gap-2 font-display text-lg font-semibold md:text-xl">
            <BarChart3 className="h-5 w-5 text-cyan-400" />
            Competitor comparison <span className="text-xs font-mono font-normal tracking-wide text-cyan-300/70">VS Showdown</span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare {competitors.length} public-signal opportunit{competitors.length === 1 ? "y" : "ies"} in {envyMetrics?.niche || "your niche"}. Velocity and revenue are estimates.
          </p>
        </div>
        <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan-400">
          Public signals
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <NicheDonutChart competitors={competitors} />
        <VelocityBarChart competitors={competitors} />
        <ThreatLevelGauge score={envyMetrics?.averageViralVelocity || 0} />
      </div>

      <CompetitorDataGrid competitors={competitors} />
    </section>
  );
}
