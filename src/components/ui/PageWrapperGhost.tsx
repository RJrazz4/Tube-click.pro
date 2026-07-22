import { ReactNode } from "react";
import { VideoWallBackground } from "./VideoWallBackground";
import { WarRoomTicker } from "./WarRoomTicker";
import { GhostNodeStatus } from "./GhostNodeStatus";
import { LiveActiveCounter } from "./LiveActiveCounter";
import { BroadcastSyncIndicator } from "./BroadcastSyncIndicator";
import { GhostIntelDrop } from "./GhostIntelDrop";

/**
 * PageWrapperGhost - Phase 5 Global Polish Wrapper
 * Ensures every page has Matrix stealth vibe, video wall background, ticker, ghost nodes
 * Zero-budget, lightweight, glassmorphism command center
 */

interface Props {
  children: ReactNode;
  intensity?: "low" | "medium" | "high";
  showTicker?: boolean;
  showIntel?: boolean;
  showNodes?: boolean;
}

export function PageWrapperGhost({ children, intensity = "low", showTicker = true, showIntel = false, showNodes = true }: Props) {
  return (
    <div className="relative min-h-[60vh]">
      <VideoWallBackground intensity={intensity} />
      <div className="relative z-10 space-y-4">
        {showTicker && <WarRoomTicker />}
        {showNodes && (
          <div className="flex flex-wrap items-center gap-3">
            <LiveActiveCounter compact />
            <GhostNodeStatus compact />
            <BroadcastSyncIndicator compact />
            <span className="hidden md:inline text-[10px] font-mono text-muted-foreground">LEVEL 4 • PRIVATE TRACKER • tubeclickpro.in • Ghost Protocol • $97→₹0</span>
          </div>
        )}
        {showIntel && <GhostIntelDrop />}
        {children}
      </div>
    </div>
  );
}
