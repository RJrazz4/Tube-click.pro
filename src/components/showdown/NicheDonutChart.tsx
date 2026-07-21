import { Cell, Pie, PieChart } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { CompetitorVideo } from "@/stores/useCloneCrushStore";

const SLICE_COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#f43f5e", "#22c55e", "#3b82f6"];
const chartConfig = {
  views: { label: "Views", color: "#8b5cf6" },
} satisfies ChartConfig;

export function NicheDonutChart({ competitors }: { competitors: CompetitorVideo[] }) {
  const data = competitors.map((competitor, index) => ({
    name: competitor.channelName || `Competitor ${index + 1}`,
    views: Math.max(0, competitor.viewsCount || 0),
    fill: SLICE_COLORS[index % SLICE_COLORS.length],
  }));
  const totalViews = data.reduce((sum, item) => sum + item.views, 0);

  return (
    <Card className="cyber-card border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-base">Niche Market Share</CardTitle>
        <CardDescription>Share of tracked views by competitor</CardDescription>
      </CardHeader>
      <CardContent>
        {totalViews > 0 ? (
          <>
            <ChartContainer config={chartConfig} className="mx-auto h-[240px] w-full max-w-[360px]">
              <PieChart accessibilityLayer>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent nameKey="name" formatter={(value) => Number(value).toLocaleString()} />}
                />
                <Pie
                  data={data}
                  dataKey="views"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {data.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.map((entry) => (
                <div key={entry.name} className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.fill }} />
                  <span className="truncate text-muted-foreground">{entry.name}</span>
                  <span className="ml-auto font-mono text-foreground">
                    {Math.round((entry.views / totalViews) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
            View totals are not available yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
