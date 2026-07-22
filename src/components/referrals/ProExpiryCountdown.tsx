import { useEffect, useState } from "react";

/**
 * Pro Expiry Live Countdown - Scarcity trigger, $100/mo illusion
 * Vanilla interval, local math, zero budget, high urgency
 */

interface Props {
  expiresAt: string;
  compact?: boolean;
}

function formatRemaining(ms: number): { d: number; h: number; m: number; s: number; isUrgent: boolean; isCritical: boolean } {
  if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0, isUrgent: false, isCritical: true };
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { d, h, m, s, isUrgent: d === 0, isCritical: totalSec < 3600 * 6 };
}

export function ProExpiryCountdown({ expiresAt, compact = false }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const expiry = new Date(expiresAt).getTime();
  const remaining = expiry - now;
  const { d, h, m, s, isUrgent, isCritical } = formatRemaining(remaining);

  if (remaining <= 0) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-300">
        ELITE NODE EXPIRED • Ghost cache purged • Re-qualify via referral uplink
      </div>
    );
  }

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono font-bold ${isCritical ? "border-red-500/30 bg-red-500/15 text-red-300 animate-pulse" : isUrgent ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-green-500/20 bg-green-500/10 text-green-300"}`}>
        <span className={`w-1 h-1 rounded-full ${isCritical ? "bg-red-400" : "bg-green-400"} animate-pulse`} />
        {d > 0 ? `${d}d ${h}h` : `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`} LEFT
      </span>
    );
  }

  return (
    <div className={`rounded-xl border p-3 flex items-center justify-between backdrop-blur-md ${isCritical ? "border-red-500/30 bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.15)]" : isUrgent ? "border-amber-500/20 bg-amber-500/5" : "border-green-500/20 bg-green-500/5"}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isCritical ? "bg-red-500/20" : "bg-green-500/15"}`}>
          <span className={`w-2 h-2 rounded-full ${isCritical ? "bg-red-400 animate-ping" : "bg-green-400 animate-pulse"}`} />
        </div>
        <div>
          <p className={`text-[11px] font-mono font-bold uppercase tracking-widest ${isCritical ? "text-red-400" : "text-green-400"}`}>{isCritical ? "⚠️ ELITE NODE EXPIRING" : "Elite Node Active"}</p>
          <p className="text-[10px] font-mono text-muted-foreground">Ghost Node MUM-01 • Encrypted • Quantum cached • tubeclickpro.in</p>
        </div>
      </div>
      <div className="flex items-center gap-1 font-mono text-xs font-bold">
        {d > 0 && <><span className={`px-1.5 py-1 rounded bg-black/40 border ${isCritical ? "border-red-500/30 text-red-300" : "border-green-500/20 text-green-300"}`}>{d}d</span><span className="text-muted-foreground">:</span></>}
        <span className={`px-1.5 py-1 rounded bg-black/60 border ${isCritical ? "border-red-500/30 text-red-300" : "border-primary/20 text-primary"}`}>{h.toString().padStart(2,"0")}</span><span className="text-muted-foreground">:</span>
        <span className={`px-1.5 py-1 rounded bg-black/60 border ${isCritical ? "border-red-500/30 text-red-300" : "border-primary/20 text-primary"}`}>{m.toString().padStart(2,"0")}</span><span className="text-muted-foreground">:</span>
        <span className={`px-1.5 py-1 rounded bg-black/60 border ${isCritical ? "border-red-500/30 text-red-300 animate-pulse" : "border-cyan-400/20 text-cyan-300"}`}>{s.toString().padStart(2,"0")}</span>
      </div>
    </div>
  );
}
