import { useEffect, useState } from "react";

/**
 * Ghost Streak - Addictive habit loop, zero budget
 * localStorage day counter + XP bar, pure frontend dopamine
 */

function getStreak(): { streak: number; xp: number; lastDate: string } {
  try {
    const raw = localStorage.getItem("ghost_streak_v2");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { streak: 1, xp: 20, lastDate: new Date().toDateString() };
}

function saveStreak(s: { streak: number; xp: number; lastDate: string }) {
  try { localStorage.setItem("ghost_streak_v2", JSON.stringify(s)); } catch {}
}

export function GhostStreak({ compact = false }: { compact?: boolean }) {
  const [streak, setStreak] = useState(() => getStreak());

  useEffect(() => {
    const today = new Date().toDateString();
    const last = streak.lastDate;
    const lastD = new Date(last);
    const todayD = new Date(today);
    const diff = Math.floor((todayD.getTime() - lastD.getTime()) / (1000*60*60*24));

    if (diff === 0) return; // same day
    if (diff === 1) {
      // continue streak
      const next = { streak: streak.streak + 1, xp: Math.min(1000, streak.xp + 20 + streak.streak*5), lastDate: today };
      setStreak(next);
      saveStreak(next);
    } else if (diff > 1) {
      // broken
      const reset = { streak: 1, xp: Math.min(1000, streak.xp + 5), lastDate: today };
      setStreak(reset);
      saveStreak(reset);
    }
  }, []); // run once

  const xpPercent = Math.min(100, (streak.xp % 100));
  const level = Math.floor(streak.xp / 100) + 1;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-[10px] font-mono">
        <span className="text-orange-400">🔥</span>
        <span className="font-bold text-orange-300">{streak.streak} DAY STREAK</span>
        <span className="text-muted-foreground">• Lv{level}</span>
      </span>
    );
  }

  return (
    <div className="ghost-streak rounded-xl glass-strong border-orange-500/20 p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center shrink-0">
        <span className="text-lg">🔥</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-mono font-bold text-orange-300">{streak.streak} DAY GHOST STREAK</p>
          <span className="text-[9px] font-mono bg-secondary/60 border border-border/40 px-1.5 py-0.5 rounded">Lv{level} • {streak.xp} XP</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-orange-400 to-red-400 transition-all duration-700" style={{ width: `${xpPercent}%` }} />
        </div>
        <p className="text-[9px] font-mono text-muted-foreground mt-1">Return daily to keep streak • Ghost nodes sync • Quantum cached</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] font-mono text-muted-foreground">XP</p>
        <p className="text-sm font-mono font-bold text-orange-300">{streak.xp}</p>
      </div>
    </div>
  );
}
