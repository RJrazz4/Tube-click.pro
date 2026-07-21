import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { CompetitorVideo } from "@/stores/useCloneCrushStore";

const chartConfig = {
  velocity: { label: "Velocity score", color: "#f43f5e" },
} satisfies ChartConfig;

function velocityColor(score: number) {
  if (score >= 70) return "#ef4444";
  if (score >= 40) return "#f59e0b";
  return "#22c55e";
}

export function VelocityBarChart({ competitors }: { competitors: CompetitorVideo[] }) {
  const data = competitors.map((competitor, index) => ({
    channel: competitor.channelName || `Competitor ${index + 1}`,
    velocity: Math.max(0, Math.min(100, competitor.viralVelocityScore || 0)),
  }));

  return (
    <Card className="cyber-card border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-base">Viral Velocity</CardTitle>
        <CardDescription>Current momentum score from 0 to 100</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20 }} accessibilityLayer>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} />
            <YAxis
              dataKey="channel"
              type="category"
              tickLine={false}
              axisLine={false}
              width={92}
              tickFormatter={(value: string) => value.length > 13 ? `${value.slice(0, 12)}…` : value}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="velocity" radius={[0, 6, 6, 0]} barSize={24}>
              {data.map((entry) => <Cell key={entry.channel} fill={velocityColor(entry.velocity)} />)}
            </Bar>
          </BarChart>
        </ChartContainer>
        <div className="flex flex-wrap justify-center gap-4 text-[11px] text-muted-foreground">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />Low &lt;40</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />Elevated 40–69</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Critical 70+</span>
        </div>
      </CardContent>
    </Card>
  );
}
