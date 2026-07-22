import { useEffect, useState } from "react";
import { Sparkles, X, Zap } from "lucide-react";

/**
 * Ghost Intel Drop - Daily classified drop banner
 * Date logic only, zero API, lightweight
 * Shows at 00:00 IST based on local date, new "3 patterns detected"
 */

const DROPS = [
  "3 new viral patterns detected in Tech & Coding niche - shock + number = 3.4x CTR",
  "Algorithm shift: Long-form 10m+ favored today - Ghost mesh detected spike",
  "New retention loop: At 3AM Everything Changed - deploying across ghost nodes",
  "Viral thumbnail DNA: Extreme close-up + red/blue lighting = 2.1x CTR - intel drop",
  "Stealth disguise update: Swap analogies via ghost nodes - never flagged as clone",
];

export function GhostIntelDrop() {
  const [show, setShow] = useState(false);
  const [dropText, setDropText] = useState("");

  useEffect(() => {
    try {
      const today = new Date().toDateString();
      const lastSeen = localStorage.getItem("ghost_intel_last_seen");
      const dropIdx = (new Date().getDate() + new Date().getMonth() * 31) % DROPS.length;
      const text = DROPS[dropIdx];

      if (lastSeen !== today) {
        setDropText(text);
        // Show after 2.5s - feels like live intel push
        const t = setTimeout(() => setShow(true), 2500);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem("ghost_intel_last_seen", new Date().toDateString());
    } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="ghost-intel-drop relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-card/80 to-primary/10 backdrop-blur-xl p-3 flex items-start gap-3 animate-fade-in">
      <div className="absolute inset-0 ghost-scanline opacity-[0.03] pointer-events-none" />
      <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-amber-300 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
          CLASSIFIED INTEL DROP • {new Date().toLocaleDateString()} • GHOST PROTOCOL
        </p>
        <p className="text-xs text-foreground mt-1 leading-relaxed">{dropText}</p>
        <p className="text-[9px] font-mono text-muted-foreground mt-1">MUM-01 • Encrypted • Quantum cached • Daily at 00:00 IST • Zero API</p>
      </div>
      <button onClick={dismiss} className="shrink-0 w-6 h-6 rounded-full bg-secondary/60 border border-border/40 flex items-center justify-center hover:bg-destructive/20 hover:border-destructive/30 transition-colors">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
