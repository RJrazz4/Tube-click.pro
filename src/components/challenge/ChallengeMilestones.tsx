import { Flame, Snowflake, Star, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChallengeMilestone } from "@/lib/engine/types";

/** Milestone shelf: 7 · 14 · 21 · 30 — lit by total script-days (server truth). */
export function ChallengeMilestones({
  milestones,
  totalScriptDays,
}: {
  milestones: ChallengeMilestone[];
  totalScriptDays: number;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {milestones.map((m) => (
        <div
          key={m.id}
          className={cn(
            "rounded-lg border p-2 text-center transition-colors",
            m.achieved
              ? "border-amber-400/50 bg-gradient-to-b from-amber-400/15 to-transparent"
              : "border-border/50 bg-card/40",
          )}
          title={`${m.day} script days — ${m.label}`}
        >
          <div className="flex items-center justify-center gap-1">
            {m.id === "champion" ? (
              <Trophy className={cn("w-4 h-4", m.achieved ? "text-amber-400" : "text-muted-foreground/50")} />
            ) : m.achieved ? (
              <Star className="w-4 h-4 text-amber-400" />
            ) : (
              <Flame className="w-4 h-4 text-muted-foreground/40" />
            )}
          </div>
          <p className={cn("mt-1 text-[10px] font-semibold leading-tight", m.achieved ? "text-foreground" : "text-muted-foreground/60")}>
            {m.label}
          </p>
          <p className="text-[9px] font-mono text-muted-foreground/50">
            {Math.min(totalScriptDays, m.day)}/{m.day}
          </p>
        </div>
      ))}
    </div>
  );
}

export function FreezeBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-mono text-sky-300">
      <Snowflake className="w-3 h-3" /> {count} freeze{count > 1 ? "s" : ""} banked
    </span>
  );
}
