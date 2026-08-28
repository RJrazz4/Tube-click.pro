import { useEffect, useState } from "react";
import { Lock, Timer, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FreeCooldownOverlayProps {
  unlocksAt: number;
  views?: string;
  onUpgrade: () => void;
  /** Tile overlays sit ABOVE the thumbnail with the timer prominent. */
  variant?: "tile" | "hero" | "result";
}

function formatRemaining(ms: number): { human: string } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return { human: `${d}d ${pad(h % 24)}:${pad(m)}:${pad(s)}` };
  }
  return { human: `${pad(h)}:${pad(m)}:${pad(s)}` };
}

/**
 * Dark encrypted/glassmorphism cooldown overlay for the 24h free-tier
 * conveyor belt. On tile variant, the live countdown sits prominently
 * ABOVE the thumbnail and the view count is rendered at a large,
 * FOMO-sized font. Hero/result variants retain their bottom-banner
 * treatment so they don't break the result-card layout.
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
                Next conveyor slot unlocks in
              </p>
              <p className="text-lg font-mono font-black text-primary mt-0.5 tracking-wider">⏳ {human}</p>
            </div>
          </div>
          <Button size="sm" onClick={onUpgrade} className="cyber-button h-9 gap-1.5 px-4 text-xs font-display whitespace-nowrap">
            <Sparkles className="h-3.5 w-3.5" /> See Pro options
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
              <p className="text-[10px] font-display font-bold uppercase tracking-wider text-foreground">Locked • Next in</p>
              <p className="text-sm font-mono font-black text-primary">⏳ {human}{views ? ` • ${views}` : ""}</p>
            </div>
          </div>
          <Button size="sm" onClick={onUpgrade} className="cyber-button h-7 gap-1 px-2.5 text-[10px] font-display whitespace-nowrap">
            <Sparkles className="h-3 w-3" /> Skip Wait
          </Button>
        </div>
      </div>
    );
  }

  // Tile variant: countdown ABOVE the thumbnail, big view count, dark glass overlay.
  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-xl border border-primary/40 bg-gradient-to-b from-black/90 via-black/75 to-black/90 backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 ghost-scanline opacity-[0.12]" />
      {/* Countdown band ABOVE thumbnail */}
      <div className="relative z-10 flex items-center justify-center gap-1.5 border-b border-primary/30 bg-primary/15 px-2 py-1.5">
        <Lock className="h-3 w-3 text-primary" />
        <Timer className="h-3 w-3 text-primary animate-pulse" />
        <span className="font-mono text-[11px] font-black text-primary tracking-widest">⏳ {human}</span>
      </div>
      {/* Big view count centered */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-1 px-2 text-center">
        <p className="font-display text-xl md:text-2xl font-black text-foreground drop-shadow-[0_2px_8px_rgba(139,92,246,0.6)] leading-none">
          {views || "Viral"}
        </p>
        <p className="text-[9px] font-mono uppercase tracking-widest text-primary/80">views • locked</p>
      </div>
      {/* CTA band */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onUpgrade(); }}
        className="relative z-10 m-1.5 cyber-button flex h-7 items-center justify-center gap-1 rounded-md text-[9px] font-display font-bold uppercase tracking-wider"
      >
        <Sparkles className="h-2.5 w-2.5" /> See Pro options
      </button>
    </div>
  );
}
