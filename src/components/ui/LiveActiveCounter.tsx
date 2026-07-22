import { useEffect, useState } from "react";

/**
 * Live Active Counter + Loss Aversion Ticker
 * Zero-budget: localStorage seeded counter + vanilla rAF for $ loss
 * Psychological trigger: loss aversion, social proof, urgency
 */

function getSeededBase(): number {
  try {
    const stored = localStorage.getItem("ghost_base_counter");
    if (stored) return parseInt(stored, 10);
    const base = 2847 + (new Date().getDate() * 37) % 500;
    localStorage.setItem("ghost_base_counter", base.toString());
    return base;
  } catch { return 2847; }
}

export function LiveActiveCounter({ compact = false }: { compact?: boolean }) {
  const [liveCount, setLiveCount] = useState<number>(() => getSeededBase());
  const [todayDeployments, setTodayDeployments] = useState<number>(() => 127 + (new Date().getHours() * 7) % 100);

  useEffect(() => {
    const id = setInterval(() => {
      setLiveCount(c => {
        const next = c + Math.floor(Math.random() * 3) + 1;
        try { localStorage.setItem("ghost_base_counter", next.toString()); } catch {}
        return next;
      });
      setTodayDeployments(t => t + (Math.random() > 0.7 ? 1 : 0));
    }, 42000); // 42s - lightweight, not spammy
    return () => clearInterval(id);
  }, []);

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-[10px] font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-green-300 font-bold">{liveCount.toLocaleString()} Ghost Ops Live</span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1.5">
        <span className="relative w-2 h-2 rounded-full bg-green-400">
          <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-60" />
        </span>
        <span className="text-[11px] font-mono font-bold text-green-300">{liveCount.toLocaleString()} Ghost Ops Live</span>
        <span className="text-[9px] font-mono text-muted-foreground">• {todayDeployments} today</span>
      </div>
      <span className="text-[9px] font-mono text-muted-foreground hidden md:inline">
        Ghost mesh: 3 nodes • Encrypted
      </span>
    </div>
  );
}

// Loss Aversion Ticker - shows $ lost since landing
export function LossAversionTicker({ dailyLoss = 120 }: { dailyLoss?: number }) {
  const [lost, setLost] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = Date.now();
    try {
      const saved = sessionStorage.getItem("ghost_loss_start");
      if (!saved) sessionStorage.setItem("ghost_loss_start", start.toString());
    } catch {}

    const perSecond = dailyLoss / 86400;
    const id = setInterval(() => {
      const now = Date.now();
      let startTime = start;
      try {
        const saved = sessionStorage.getItem("ghost_loss_start");
        if (saved) startTime = parseInt(saved, 10);
      } catch {}
      const elapsedSec = Math.floor((now - startTime) / 1000);
      setSeconds(elapsedSec);
      setLost(perSecond * elapsedSec);
    }, 1000);
    return () => clearInterval(id);
  }, [dailyLoss]);

  if (seconds < 3) return null; // don't show immediately

  return (
    <div className="loss-ticker flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 animate-fade-in">
      <span className="text-[10px] font-mono text-red-400 font-bold">📉 LIVE LOSS:</span>
      <span className="text-[11px] font-mono text-red-300">~${lost.toFixed(2)} slipped to competitors</span>
      <span className="text-[9px] font-mono text-muted-foreground">since you landed • {Math.floor(seconds/60)}m ago</span>
    </div>
  );
}
