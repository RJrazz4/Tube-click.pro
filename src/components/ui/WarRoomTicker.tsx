import { useEffect, useState, useMemo } from "react";

/**
 * War Room Ticker - Bloomberg style live intel ticker
 * Zero-budget: seeded PRNG + vanilla interval, no API calls
 * Looks like real-time market data, costs 0ms
 */

const TICKER_POOL = [
  "MrBeast: +12.4k subs/hr • VELOCITY: 94",
  "Tech Burner uploaded 6m ago • +89k views",
  "THREAT ALERT: Competitor gaining 3.2k/hr",
  "YOUR NICHE CPM: $8.20 • EST. REVENUE: $420/day",
  "GHOST NODE MUM-01: 34% load • 87ms latency",
  "Neural engine: 2,847 protocols deployed (24h)",
  "Retention spike detected: 68% avg watch time",
  "Algorithm: FAVORING long-form 10m+ today",
  "Viral pattern: Shock + Number = 3.4x CTR",
  "Stealth disguise: ACTIVE • Clone shield: ON",
];

function seededShuffle(arr: string[], seed: number): string[] {
  let s = seed;
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function WarRoomTicker() {
  const [tick, setTick] = useState(0);
  const [liveNumber, setLiveNumber] = useState(2847);

  // Lightweight seeded shuffle based on day
  const items = useMemo(() => {
    const daySeed = new Date().getDate() + new Date().getMonth() * 31;
    return seededShuffle(TICKER_POOL, daySeed);
  }, []);

  useEffect(() => {
    // Update ticker scroll every 40s (lightweight)
    const id = setInterval(() => setTick(t => (t + 1) % items.length), 8000);
    return () => clearInterval(id);
  }, [items.length]);

  useEffect(() => {
    // Fake live counter: increments every 42 seconds (seeded illusion of live users)
    const id = setInterval(() => {
      setLiveNumber(n => n + Math.floor(Math.random() * 3) + 1);
    }, 42000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="war-room-ticker relative overflow-hidden rounded-lg border border-primary/15 bg-black/70 backdrop-blur-md">
      {/* Green live dot */}
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-primary/10 border-r border-primary/15 flex items-center justify-center z-10">
        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
      </div>
      <div className="flex items-center h-9 pl-10 pr-3">
        <div className="flex items-center gap-6 animate-marquee whitespace-nowrap">
          {/* Double the items for seamless loop via CSS */}
          {[...items, ...items].map((text, i) => (
            <span key={i} className="flex items-center gap-6 text-[11px] font-mono">
              <span className="text-muted-foreground/40">•</span>
              <span className={i % 3 === 0 ? "text-cyan-300" : i % 3 === 1 ? "text-primary" : "text-green-400"}>
                {text}
              </span>
            </span>
          ))}
        </div>
        <div className="ml-auto pl-4 flex items-center gap-2 shrink-0 border-l border-border/20">
          <span className="text-[9px] font-mono text-muted-foreground">GHOST OPS LIVE:</span>
          <span className="text-[11px] font-mono font-bold text-green-400">{liveNumber.toLocaleString()}</span>
        </div>
      </div>
      <style>{`
        .war-room-ticker .animate-marquee {
          animation: marquee 120s linear infinite;
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
