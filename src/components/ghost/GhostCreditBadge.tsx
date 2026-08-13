/**
 * src/components/ghost/GhostCreditBadge.tsx
 *
 * Small stateless chip that shows remaining credits for a specific
 * Ghost action. Renders a lock when the user has 0 remaining or is free
 * tier, otherwise renders a cyan "⚡ BLACK-OP LANE" pill on black-ops.
 *
 * Pure presentational component — parent wires its own onClick and
 * gating logic (e.g. free clicks route to /rewards?upsell=...).
 */
import { Lock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GhostCreditBadgeProps {
  action: "interrogate" | "squad" | "recon" | "dawn_patrol";
  remaining: number;
  limit: number | null;      // null = unlimited
  allowed: boolean;
  isBlackOps?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const ACTION_LABEL: Record<GhostCreditBadgeProps["action"], string> = {
  interrogate: "INTERROGATE",
  squad: "SQUAD",
  recon: "VISUAL RECON",
  dawn_patrol: "DAWN PATROL",
};

export function GhostCreditBadge({
  remaining,
  limit,
  allowed,
  isBlackOps = false,
  size = "sm",
  className,
}: GhostCreditBadgeProps) {
  const unlimited = limit === null || limit === 0 && isBlackOps;
  const locked = !allowed;
  const pad = size === "md" ? "px-3 py-1.5 text-xs" : "px-2 py-0.5 text-[10px]";
  if (locked) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 text-muted-foreground font-mono tracking-widest uppercase",
          pad,
          className,
        )}
      >
        <Lock className="w-3 h-3" />
        <span>locked</span>
      </span>
    );
  }
  if (isBlackOps) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 text-cyan-300 font-mono tracking-widest uppercase shadow-[0_0_12px_rgba(34,211,238,0.25)]",
          pad,
          className,
        )}
      >
        <Zap className="w-3 h-3" />
        <span>⚡ BLACK-OP LANE</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 text-foreground/80 font-mono tracking-widest uppercase",
        pad,
        className,
      )}
    >
      <span>{unlimited ? "∞" : `${remaining}/${limit}`}</span>
      <span className="opacity-60">credits</span>
    </span>
  );
}
