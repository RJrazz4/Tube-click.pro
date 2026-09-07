import { useMemo } from "react";
import { Layers, Lock, Plus, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCloneCrushStore, FREE_GHOST_CACHE_SLOTS, PRO_GHOST_CACHE_SLOTS } from "@/stores/useCloneCrushStore";

/**
 * Active content conveyor slots — the working slots holding the creator's
 * profiled channels / queued packages. Sits beside the live visualizations in
 * the Command Center middle grid. Free tier shows 1 slot; Pro shows 5.
 */
export function ConveyorSlots({ isPro }: { isPro?: boolean }) {
  const savedChannels = useCloneCrushStore((s) => s.savedChannels);
  const conveyorQueue = useCloneCrushStore((s) => s.conveyorQueue);

  const slots = isPro ? PRO_GHOST_CACHE_SLOTS : FREE_GHOST_CACHE_SLOTS;
  const filled = useMemo(() =>
    (savedChannels ?? []).filter((c) => c && typeof c.slotIndex === "number"),
    [savedChannels],
  );
  const hasQueue = (conveyorQueue?.length ?? 0) > 0;

  return (
    <Card className="cyber-card border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <Layers className="h-4 w-4 text-primary" /> Content Conveyor
        </CardTitle>
        <CardDescription>{isPro ? "Pro slots" : "Free slot"} — your tracked channels & queued packages</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: slots }, (_, i) => {
          const ch = filled.find((c) => c.slotIndex === i);
          const locked = i >= (isPro ? FREE_GHOST_CACHE_SLOTS : 1);
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                locked
                  ? "border-border/30 bg-secondary/20 opacity-70"
                  : "border-border/50 bg-secondary/40"
              }`}
            >
              {locked ? (
                <Lock className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              ) : ch ? (
                <img src={ch.avatar || undefined} alt={ch.name} className="h-9 w-9 shrink-0 rounded-lg object-cover bg-card border border-border/50" />
              ) : (
                <div className="h-9 w-9 shrink-0 rounded-lg border border-dashed border-border/60 flex items-center justify-center">
                  <Plus className="h-4 w-4 text-muted-foreground/50" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-semibold ${locked ? "text-muted-foreground/70" : "text-foreground"}`}>
                  {locked ? "Locked — upgrade to Pro" : ch ? ch.name : `Slot ${i + 1} · Empty`}
                </p>
                <p className="truncate text-[10px] font-mono text-muted-foreground">
                  {locked ? "unlockable" : ch ? ch.handle || ch.url : "tap to add a channel"}
                </p>
              </div>
              {!locked && (
                <Link to="/clone-crush" className="shrink-0 text-primary hover:text-accent transition-colors" aria-label={`Open slot ${i + 1}`}>
                  <Play className="h-4 w-4" />
                </Link>
              )}
            </div>
          );
        })}
        {hasQueue && (
          <p className="pt-1 text-[10px] font-mono text-cyan-400/80">
            {conveyorQueue.length} package{conveyorQueue.length === 1 ? "" : "s"} in the conveyor
          </p>
        )}
      </CardContent>
    </Card>
  );
}
