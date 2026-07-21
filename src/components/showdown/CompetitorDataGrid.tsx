import { useMemo, useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CompetitorVideo } from "@/stores/useCloneCrushStore";

type SortOption = "velocity-desc" | "velocity-asc" | "revenue-desc" | "revenue-asc";

function velocityBadge(score: number) {
  if (score >= 70) return "border-red-500/40 bg-red-500/10 text-red-400";
  if (score >= 40) return "border-amber-500/40 bg-amber-500/10 text-amber-400";
  return "border-green-500/40 bg-green-500/10 text-green-400";
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function CompetitorDataGrid({ competitors }: { competitors: CompetitorVideo[] }) {
  const [channelFilter, setChannelFilter] = useState("");
  const [sort, setSort] = useState<SortOption>("velocity-desc");

  const rows = useMemo(() => {
    const query = channelFilter.trim().toLowerCase();
    return competitors
      .filter((competitor) => !query || competitor.channelName.toLowerCase().includes(query))
      .sort((a, b) => {
        const direction = sort.endsWith("desc") ? -1 : 1;
        const fieldA = sort.startsWith("velocity") ? a.viralVelocityScore || 0 : a.estimatedRevenueNum || 0;
        const fieldB = sort.startsWith("velocity") ? b.viralVelocityScore || 0 : b.estimatedRevenueNum || 0;
        return (fieldA - fieldB) * direction;
      });
  }, [channelFilter, competitors, sort]);

  return (
    <Card className="cyber-card border-border/70">
      <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <CardTitle className="font-display text-base">Competitor Data Grid</CardTitle>
          <CardDescription>Filter channels and rank opportunities by momentum or revenue</CardDescription>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <div className="relative sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value)}
              placeholder="Filter channel name…"
              aria-label="Filter by channel name"
              className="bg-secondary/40 pl-9"
            />
          </div>
          <div className="relative">
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              aria-label="Sort competitors"
              className="h-10 w-full rounded-md border border-input bg-secondary/40 pl-9 pr-3 text-sm text-foreground sm:w-48"
            >
              <option value="velocity-desc">Velocity: high to low</option>
              <option value="velocity-asc">Velocity: low to high</option>
              <option value="revenue-desc">Revenue: high to low</option>
              <option value="revenue-asc">Revenue: low to high</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[260px]">Video Title</TableHead>
              <TableHead className="min-w-[150px]">Channel</TableHead>
              <TableHead>Views</TableHead>
              <TableHead>Velocity</TableHead>
              <TableHead>Est. Revenue</TableHead>
              <TableHead>Upload Frequency</TableHead>
              <TableHead>Published At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((competitor) => {
              const velocity = competitor.viralVelocityScore || 0;
              return (
                <TableRow key={competitor.id || competitor.videoId}>
                  <TableCell>
                    <a
                      href={competitor.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="line-clamp-2 font-medium text-foreground hover:text-primary"
                    >
                      {competitor.title}
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{competitor.channelName}</TableCell>
                  <TableCell className="font-mono">
                    {competitor.viewsCount ? formatCompact(competitor.viewsCount) : competitor.views}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-mono", velocityBadge(velocity))}>{velocity}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-green-400">
                    {competitor.estimatedRevenue || `$${(competitor.estimatedRevenueNum || 0).toLocaleString()}`}
                  </TableCell>
                  <TableCell>{competitor.uploadFrequency || "N/A"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{competitor.publishedAt || "N/A"}</TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No competitors match that channel filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
