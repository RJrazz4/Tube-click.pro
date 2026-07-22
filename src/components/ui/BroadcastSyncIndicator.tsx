import { useEffect, useState } from "react";

/**
 * Broadcast Sync Indicator - Collaborative war room illusion
 * Uses BroadcastChannel API (native), zero cost
 * If 2 tabs open, shows "2 nodes synced • Collaborative war room"
 */

export function BroadcastSyncIndicator({ compact = false }: { compact?: boolean }) {
  const [nodes, setNodes] = useState(1);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    try {
      const bc = new BroadcastChannel("ghost_mesh");
      const id = Math.random().toString(36).slice(2, 7);
      const peers = new Set<string>([id]);

      const announce = () => bc.postMessage({ type: "announce", id });
      const handle = (e: MessageEvent) => {
        if (e.data?.type === "announce" && e.data?.id) {
          peers.add(e.data.id);
          setNodes(peers.size);
          setLastSync(new Date());
          // Respond back
          bc.postMessage({ type: "ack", id });
        }
        if (e.data?.type === "ack" && e.data?.id) {
          peers.add(e.data.id);
          setNodes(peers.size);
          setLastSync(new Date());
        }
      };

      bc.addEventListener("message", handle);
      announce();
      const interval = setInterval(announce, 5000);

      return () => {
        clearInterval(interval);
        bc.removeEventListener("message", handle);
        bc.close();
      };
    } catch {
      // BroadcastChannel not supported - fallback to 1 node
      setNodes(1);
    }
  }, []);

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary/40 border border-border/30 px-2 py-0.5 text-[9px] font-mono text-muted-foreground">
        <span className={`w-1 h-1 rounded-full ${nodes > 1 ? "bg-green-400 animate-pulse" : "bg-muted-foreground/40"}`} />
        {nodes} node{nodes > 1 ? "s synced" : ""} • {nodes > 1 ? "Collaborative" : "Solo"} war room
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${nodes > 1 ? "bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "bg-muted-foreground/40"}`} />
      <span className="text-[10px] font-mono text-foreground font-bold">{nodes} Ghost Node{nodes > 1 ? "s Synced" : " • Solo"}</span>
      <span className="text-[9px] font-mono text-muted-foreground">{nodes > 1 ? "Collaborative war room • BroadcastChannel" : "Open 2nd tab for collaborative mesh"} • {lastSync ? lastSync.toLocaleTimeString() : "MUM-01"}</span>
    </div>
  );
}
