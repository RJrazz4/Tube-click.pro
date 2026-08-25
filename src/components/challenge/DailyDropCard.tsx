import { useEffect, useState } from "react";
import { Crosshair, Loader2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ChallengeState } from "@/lib/engine/types";
import { dropCountdownText } from "./dropCountdown";
import { useGenerateScript } from "@/hooks/useEngineData";

/**
 * The Daily Action Script drop — the appointment mechanic.
 * Appears when today's drop is available; one tap dispatches synthesis for
 * today's rotated hunger topic (deterministic server-side rotation).
 */
export function DailyDropCard({ state }: { state: ChallengeState | undefined }) {
  const navigate = useNavigate();
  const generate = useGenerateScript();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  void tick;

  if (!state || state.status === "not_enrolled" || !state.today) return null;

  const { today } = state;
  const ready = Date.now() >= Date.parse(today.drop_available_at);
  const countdown = dropCountdownText(today.drop_available_at);

  if (today.done) {
    return (
      <Card className="glass-strong border-emerald-500/30 bracket">
        <CardContent className="p-4 md:p-5 flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-foreground">Today's mission: complete ✓</p>
            <p className="text-xs text-muted-foreground">Streak protected. Publish it for a ⭐ double-credit day.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/clone-crush")}>
            Open scripts
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "bracket border-primary/40",
        ready ? "glass-strong ring-1 ring-primary/30" : "border-dashed glass",
      )}
    >
      <CardContent className="p-4 md:p-5 flex flex-wrap items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center border",
            ready ? "bg-primary/15 border-primary/40 animate-pulse" : "bg-card/60 border-border/60",
          )}
        >
          <Crosshair className={cn("w-5 h-5", ready ? "text-primary" : "text-muted-foreground/60")} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-foreground flex items-center gap-2">
            Daily Action Script
            <span className="text-[9px] font-mono text-primary/70 border border-primary/30 rounded px-1.5 py-0.5">
              {ready ? "DROP READY" : `DROP ${countdown}`}
            </span>
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {today.drop_topic
              ? `Today's mission topic: ${today.drop_topic} — chosen by your own audience data.`
              : "Connect YouTube so we can pick your mission from real audience data."}
          </p>
        </div>
        {ready ? (
          <Button
            size="sm"
            className="font-semibold"
            disabled={generate.isPending || !today.drop_topic}
            onClick={() => generate.mutate(today.drop_topic ?? undefined)}
          >
            {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Claim & Generate"}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled>
            Locked • {countdown}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
