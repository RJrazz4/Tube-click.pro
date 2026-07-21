import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  threat: { label: "Threat level", color: "#ef4444" },
} satisfies ChartConfig;

function threatMeta(score: number) {
  if (score >= 70) return { color: "#ef4444", label: "Critical", textClass: "text-red-400" };
  if (score >= 40) return { color: "#f59e0b", label: "Elevated", textClass: "text-amber-400" };
  return { color: "#22c55e", label: "Controlled", textClass: "text-green-400" };
}

export function ThreatLevelGauge({ score }: { score: number }) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score || 0)));
  const meta = threatMeta(normalizedScore);
  const data = [{ name: "Threat", threat: normalizedScore, fill: meta.color }];

  return (
    <Card className="cyber-card border-border/70">
      <CardHeader className="pb-0">
        <CardTitle className="font-display text-base">Overall Threat Level</CardTitle>
        <CardDescription>Average competitor viral velocity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative mx-auto h-[240px] max-w-[320px]">
          <ChartContainer config={chartConfig} className="h-full w-full">
            <RadialBarChart
              data={data}
              innerRadius="68%"
              outerRadius="92%"
              startAngle={210}
              endAngle={-30}
              barSize={18}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} dataKey="threat" tick={false} />
              <RadialBar dataKey="threat" background cornerRadius={10} />
            </RadialBarChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-5">
            <span className={`font-display text-4xl font-black ${meta.textClass}`}>{normalizedScore}</span>
            <span className="text-xs text-muted-foreground">out of 100</span>
            <span className={`mt-1 text-xs font-bold uppercase tracking-widest ${meta.textClass}`}>{meta.label}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
