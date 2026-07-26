import { useEffect, useState } from "react";
import { Lock, Timer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FreeCooldownOverlayProps {
  /** Epoch ms at which the cooldown ends. */
  unlocksAt: number;
  /** Original view-count string rendered under the timer. */
  views?: string;
  /** Fired when the user clicks Skip Wait — should route to /rewards. */
  onUpgrade: () => void;
  /** Sizing variant. */
  variant?: "tile" | "hero" | "result";
}

function formatRemaining(ms: number): { h: string; m: string; s: string; human: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  let human = `${pad(h)}:${pad(m)}:${pad(s)}`;
  if (h >= 24) human = `${Math.floor(h / 24)}d ${pad(h % 24)}h`;
  return { h: pad(h), m: pad(m), s: pad(s), human };
}

/**
 * Dark encrypted/glassmorphism overlay drawn on top of competitor tiles
 * (and the "current result" panel) while a free-tier user is inside
 * their 24h post-first-run cooldown. Shows a live countdown to unlock
 * plus the Skip Wait -> Pro CTA.
 *
 * The timer is driven by a 1s interval against Date.now() so it is
 * resilient to tab backgrounding, sleep, reload, and clock skew within
 * a single device.
 */
export function FreeCooldownOverlay({ unlocksAt, views, onUpgrade, variant = "tile" }: FreeCooldownOverlayProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    if (unlocksAt <= Date.now()) return;
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [unlocksAt]);

  const remaining = Math.max(0, unlocksAt - now);
  const { human } = formatRemaining(remaining);

  if (variant === "hero") {
    return (
      <div className="relative mt-3 w-full overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-card/95 via-primary/10 to-card/95 p-4 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 ghost-scanline opacity-[0.08]" />
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/15">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-display font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-primary animate-pulse" />
                24h Ghost Cooldown Active
              </p>
              <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                ⏳ Next unlock in <span className="text-primary font-bold">{human}</span>
                {views ? <span className="ml-2">• {views}</span> : null}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={onUpgrade} className="cyber-button h-9 gap-1.5 px-4 text-xs font-display whitespace-nowrap">
            <Sparkles className="h-3.5 w-3.5" /> Skip Wait — Unlock Pro
          </Button>
        </div>
      </div>
    );
  }

  if (variant === "result") {
    return (
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 rounded-b-xl border-t border-primary/30 bg-gradient-to-t from-black/90 via-black/80 to-black/40 backdrop-blur-md p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-display font-bold uppercase tracking-wider text-foreground">Locked • 24h Cooldown</p>
              <p className="text-[9px] font-mono text-primary">⏳ {human}{views ? ` • ${views}` : ""}</p>
            </div>
          </div>
          <Button size="sm" onClick={onUpgrade} className="cyber-button h-7 gap-1 px-2.5 text-[10px] font-display whitespace-nowrap">
            <Sparkles className="h-3 w-3" /> Skip Wait
          </Button>
        </div>
      </div>
    );
  }

  // tile variant
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border border-primary/30 bg-gradient-to-br from-black/85 via-card/90 to-black/85 backdrop-blur-md p-2 text-center">
      <div className="pointer-events-none absolute inset-0 ghost-scanline opacity-[0.12]" />
      <Lock className="h-4 w-4 text-primary relative z-10" />
      <div className="relative z-10">
        <p className="font-mono text-[10px] font-bold text-primary leading-tight">⏳ {human}</p>
        {views ? <p className="font-mono text-[8px] text-muted-foreground mt-0.5 truncate max-w-full px-1">{views}</p> : null}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
        className="relative z-10 cyber-button h-6 px-2 rounded-md text-[8px] font-display font-bold uppercase tracking-wider flex items-center gap-1 whitespace-nowrap"
      >
        <Sparkles className="h-2.5 w-2.5" /> Skip Wait
      </button>
    </div>
  );
}
