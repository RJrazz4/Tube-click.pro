import { useMemo } from "react";
import { Flame, Snowflake, Star, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ChallengeState, DayCell } from "@/lib/engine/types";
import { ChallengeMilestones } from "./ChallengeMilestones";

/**
 * The 30-Day Consistency Tracker — the dashboard hero.
 * Every value is server-authoritative (engine /api/challenge).
 */

const SYSTEM_PROMISE =
  "The 99% Consistency System: 30 days, 30 data-driven videos. Finish the challenge and if you don't publish more consistently than you ever have, we extend your Pro free until you do.";

function cellClasses(cell: DayCell): string {
  switch (cell.kind) {
    case "done":
      return cell.star
        ? "bg-gradient-to-br from-amber-400 to-orange-500 text-black border-amber-300"
        : "bg-gradient-to-br from-emerald-500/90 to-teal-600/90 text-white border-emerald-400/50";
    case "freeze":
      return "bg-sky-500/20 border-sky-400/40 text-sky-300";
    case "missed":
      return "bg-red-500/10 border-red-500/30 text-red-400/70";
    case "today":
      return cell.done
        ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-primary ring-2 ring-primary/60 animate-pulse"
        : "bg-primary/15 border-primary text-primary ring-2 ring-primary/40 animate-pulse";
    default:
      return "bg-card/40 border-border/50 text-muted-foreground/50";
  }
}

function CellBody({ cell }: { cell: DayCell }) {
  if (cell.kind === "locked") return <span className="text-[9px] font-mono">{cell.dayNumber}</span>;
  if (cell.kind === "done") return cell.star ? <Star className="w-3.5 h-3.5" /> : <span className="text-[10px] font-bold">✓</span>;
  if (cell.kind === "freeze") return <Snowflake className="w-3.5 h-3.5" />;
  if (cell.kind === "missed") return <span className="text-[10px] font-bold">✕</span>;
  return <span className="text-[10px] font-bold">{cell.done ? "✓" : "?"}</span>;
}

export function ChallengeTracker({
  state,
  onEnroll,
  enrolling,
}: {
  state: ChallengeState | undefined;
  onEnroll: () => void;
  enrolling: boolean;
}) {
  const cells = state?.cells ?? [];
  const streak = state?.streak ?? 0;
  const total = state?.total_script_days ?? 0;
  const freezesLeft = Math.max(0, (state?.freezes_earned ?? 0) - (state?.freezes_used ?? 0));

  const legend = useMemo(
    () => [
      { label: "Script day", className: "bg-emerald-500/80" },
      { label: "⭐ Published too", className: "bg-gradient-to-br from-amber-400 to-orange-500" },
      { label: "❄ Freeze shield", className: "bg-sky-500/40" },
      { label: "Missed", className: "bg-red-500/20" },
    ],
    [],
  );

  if (!state || state.status === "not_enrolled") {
    return (
      <Card className="glass-strong border-primary/30 bracket overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-amber-500/10 pointer-events-none" />
        <CardContent className="relative p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h3 className="font-display text-lg md:text-xl font-bold text-foreground">
              The 30-Day Viral Challenge
            </h3>
            <span className="text-[9px] font-mono text-primary/70 border border-primary/30 rounded px-1.5 py-0.5">
              99% SYSTEM
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">{SYSTEM_PROMISE}</p>
          <ul className="text-xs text-muted-foreground space-y-1 font-mono">
            <li>• One Daily Action Script per day — built from YOUR audience data</li>
            <li>• Publish it and the day earns a ⭐ double credit</li>
            <li>• Miss a day? A weekly ❄ freeze shield has your back</li>
            <li>• Finish 30 days → Champion badge + Pro-extension voucher guarantee</li>
          </ul>
          <Button onClick={onEnroll} disabled={enrolling} className="font-semibold">
            {enrolling ? "Accepting..." : "Accept the Challenge"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-strong border-primary/30 bracket overflow-hidden">
      <CardHeader className="relative pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 font-display text-lg md:text-xl">
            <Flame className={cn("w-5 h-5", streak > 0 ? "text-orange-400" : "text-muted-foreground")} />
            Day {Math.min(state.elapsed_days ?? 1, 30)}/30
            <span className="text-sm font-normal text-muted-foreground">· 🔥 {streak}-day streak</span>
            {freezesLeft > 0 && (
              <span className="text-sm font-normal text-sky-300">· ❄ ×{freezesLeft} shielded</span>
            )}
          </CardTitle>
          <span className="text-[9px] font-mono text-primary/60">
            {state.status === "completed" ? "CHALLENGE COMPLETE • CHAMPION" : "SERVER-VERIFIED • LOCAL MIDNIGHT BOUNDARY"}
          </span>
        </div>
        <Progress value={(total / 30) * 100} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 md:gap-2">
          {cells.map((cell, i) => (
            <div
              key={i}
              title={cell.kind === "locked" ? `Day ${cell.dayNumber}` : cell.date}
              className={cn(
                "aspect-square rounded-md border flex items-center justify-center transition-transform hover:scale-110",
                cellClasses(cell),
              )}
            >
              <CellBody cell={cell} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
              <span className={cn("w-2.5 h-2.5 rounded-sm", l.className)} /> {l.label}
            </span>
          ))}
        </div>
        <ChallengeMilestones milestones={state.milestones ?? []} totalScriptDays={total} />
        <p className="text-[10px] leading-relaxed text-muted-foreground/80 border-t border-border/50 pt-2">{SYSTEM_PROMISE}</p>
      </CardContent>
    </Card>
  );
}
