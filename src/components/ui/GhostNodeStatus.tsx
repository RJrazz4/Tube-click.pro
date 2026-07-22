import { useEffect, useState } from "react";

/**
 * Ghost Node Status - Shows fake edge nodes, latency, load
 * Zero-budget, vanilla intervals, lightweight CSS animations
 * Makes $0 infra look like $10k multi-region mesh
 */

const NODES = [
  { id: "MUM-01", city: "Mumbai", flag: "IN" },
  { id: "BLR-02", city: "Bangalore", flag: "IN" },
  { id: "DEL-03", city: "Delhi", flag: "IN" },
];

function jitter(base: number, range: number) {
  return Math.round(base + (Math.random() - 0.5) * range);
}

export function GhostNodeStatus({ compact = false }: { compact?: boolean }) {
  const [latencies, setLatencies] = useState<number[]>([87, 92, 78]);
  const [loads, setLoads] = useState<number[]>([34, 28, 41]);
  const [activeNode, setActiveNode] = useState(0);

  useEffect(() => {
    // Lightweight interval: every 3.5s update fake metrics
    const id = setInterval(() => {
      setLatencies(prev => prev.map((l, i) => {
        const base = [87, 92, 78][i];
        return jitter(base, 12);
      }));
      setLoads(prev => prev.map((load, i) => {
        const base = [34, 28, 41][i];
        const j = jitter(base, 10);
        return Math.min(98, Math.max(5, j));
      }));
      setActiveNode(i => (i + 1) % NODES.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  if (compact) {
    return (
      <div className="ghost-nodes-compact flex items-center gap-2 text-[10px] font-mono">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-400 font-bold">MUM-01</span>
          <span className="text-muted-foreground">{latencies[0]}ms</span>
        </span>
        <span className="text-border">|</span>
        <span className="text-muted-foreground">GHOST MESH: 3 NODES • {loads[0]}% LOAD</span>
      </div>
    );
  }

  return (
    <div className="ghost-mesh grid grid-cols-3 gap-2">
      {NODES.map((node, i) => {
        const isActive = i === activeNode;
        return (
          <div
            key={node.id}
            className={`relative rounded-lg border px-2.5 py-2 transition-all duration-500 overflow-hidden ${
              isActive
                ? "bg-primary/10 border-primary/30 shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                : "bg-card/50 border-border/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-mono font-bold ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                {node.id}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "bg-muted-foreground/30"}`} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[9px] font-mono text-muted-foreground">{node.city}</span>
              <span className="text-[9px] font-mono text-cyan-300">{latencies[i]}ms</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-secondary/60 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${isActive ? "bg-gradient-to-r from-primary to-cyan-400" : "bg-muted-foreground/40"}`}
                style={{ width: `${loads[i]}%` }}
              />
            </div>
            {/* Active scanline */}
            {isActive && <div className="absolute inset-0 pointer-events-none opacity-20 ghost-scanline" />}
          </div>
        );
      })}
    </div>
  );
}
