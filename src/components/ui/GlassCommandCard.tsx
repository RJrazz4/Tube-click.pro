import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Glass Command Card - Phase 3 Matrix Command Center building block
 * Pushed YouTube grid to background, glassmorphism on top
 * $100/mo elite HUD with brackets, scanline, noise, glow
 */

interface GlassCommandCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glow?: "none" | "purple" | "cyan" | "amber" | "red" | "green";
  brackets?: boolean;
  scanline?: boolean;
  noise?: boolean;
  level?: "default" | "strong" | "ghost";
}

export function GlassCommandCard({
  children,
  className,
  glow = "none",
  brackets = true,
  scanline = false,
  noise = false,
  level = "strong",
  ...props
}: GlassCommandCardProps) {
  const glowMap = {
    none: "",
    purple: "shadow-[0_0_30px_rgba(139,92,246,0.12)] border-primary/20",
    cyan: "shadow-[0_0_30px_rgba(34,211,238,0.12)] border-cyan-400/20",
    amber: "shadow-[0_0_30px_rgba(245,158,11,0.12)] border-amber-500/20",
    red: "shadow-[0_0_30px_rgba(239,68,68,0.12)] border-red-500/20",
    green: "shadow-[0_0_30px_rgba(34,197,94,0.12)] border-green-500/20",
  };

  const levelMap = {
    default: "bg-card/70 backdrop-blur-md border-border/50",
    strong: "glass-strong",
    ghost: "glass-ghost",
  };

  return (
    <div
      className={cn(
        "relative rounded-2xl border overflow-hidden",
        levelMap[level],
        glowMap[glow],
        brackets && "bracket",
        className
      )}
      {...props}
    >
      {scanline && <div className="absolute inset-0 ghost-scanline opacity-[0.02] pointer-events-none" />}
      {noise && <div className="absolute inset-0 noise opacity-[0.01] pointer-events-none" />}
      {/* Inner gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-cyan-400/[0.02] pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
