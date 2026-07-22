import { useEffect, useState } from "react";

/**
 * Referral Leaderboard Ghost - Synthetic social proof, zero-budget
 * Seeded PRNG, vanilla interval, lightweight
 * Makes new platform feel like 10k users already inside
 */

const GHOST_NAMES = [
  "Shadow_92", "Viper_X", "Ghost_47", "Neon_Rider", "Cipher_01", "Vector_9", "Phantom_7", "Blink_42",
  "Mumbai_Maven", "Delhi_Drift", "Blr_Beast", "Indore_Intel", "Pune_Pulse", "Hydra_12"
];

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateGhostBoard(daySeed: number) {
  return GHOST_NAMES.map((name, i) => {
    const seed = daySeed + i * 13;
    const invites = Math.floor(seededRandom(seed) * 40) + 5 + (GHOST_NAMES.length - i) * 2;
    const isOnline = seededRandom(seed + 1) > 0.3;
    return { name, invites, isOnline, rank: i + 1 };
  }).sort((a, b) => b.invites - a.invites).slice(0, 6);
}

export function ReferralLeaderboardGhost({ compact = false }: { compact?: boolean }) {
  const [board, setBoard] = useState(() => generateGhostBoard(new Date().getDate()));

  useEffect(() => {
    // Re-shuffle every 90s - feels live but zero cost
    const id = setInterval(() => {
      const seed = new Date().getDate() + Math.floor(Date.now() / 90000);
      setBoard(generateGhostBoard(seed));
    }, 90000);
    return () => clearInterval(id);
  }, []);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <span className="text-muted-foreground">TOP GHOST OPS:</span>
        <div className="flex items-center gap-1.5">
          {board.slice(0, 3).map(g => (
            <span key={g.name} className="flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5">
              <span className={`w-1 h-1 rounded-full ${g.isOnline ? "bg-green-400 animate-pulse" : "bg-muted-foreground/40"}`} />
              <span className="text-primary font-bold">{g.name}</span>
              <span className="text-muted-foreground">{g.invites}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="leaderboard-ghost rounded-xl glass-strong border-primary/10 p-3.5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Ghost Leaderboard • Live • MUM-01
        </p>
        <span className="text-[9px] font-mono text-muted-foreground">TOP 6 • 24h • Encrypted</span>
      </div>
      <div className="space-y-2">
        {board.map((ghost, i) => (
          <div key={ghost.name} className={`flex items-center justify-between rounded-lg px-2.5 py-2 border transition-all ${i === 0 ? "bg-amber-500/10 border-amber-500/20" : "bg-secondary/20 border-border/30"}`}>
            <div className="flex items-center gap-2.5">
              <span className={`text-[10px] font-mono font-bold w-5 h-5 rounded-full flex items-center justify-center ${i === 0 ? "bg-amber-500 text-black" : i === 1 ? "bg-zinc-300 text-black" : i === 2 ? "bg-amber-700 text-white" : "bg-secondary text-muted-foreground"}`}>{ghost.rank}</span>
              <div>
                <p className="text-xs font-mono font-bold text-foreground flex items-center gap-1.5">{ghost.name} {ghost.isOnline && <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />}</p>
                <p className="text-[9px] font-mono text-muted-foreground">{ghost.isOnline ? "ONLINE • Ghost Node Active" : "OFFLINE • Quantum cached"} • {ghost.invites} invites</p>
              </div>
            </div>
            <span className="text-[11px] font-mono font-bold text-primary">{ghost.invites}</span>
          </div>
        ))}
      </div>
      <p className="text-[9px] font-mono text-muted-foreground/60 mt-2.5 text-center">Synthetic ghost ops • Seeded PRNG • Encrypted • Refreshes every 90s • Zero API cost</p>
    </div>
  );
}
