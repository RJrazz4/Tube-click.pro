/**
 * Phase G3 — Processing3D: unique premium "3D processing" state
 *
 * Replaces generic spinners/progress bars during image generation with a
 * signature animation: CSS-only 3D cube tumbling in perspective, a scan beam
 * sweeping across it, an SVG progress ring (inline variant) and cycling
 * stage microcopy. Accents come from src/lib/brandCopy.ts (per-brand tier).
 *
 * - Pure CSS (transform-style: preserve-3d), zero dependencies
 * - variants: "inline" (form/generation blocks), "tile" (grid cells),
 *   "overlay" (fullscreen modal state)
 * - respects prefers-reduced-motion (static cube + first stage)
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { brandCopy } from "@/lib/brandCopy";

const DEFAULT_STAGES = [
  "Analyzing prompt",
  "Composing frames",
  "Rendering pixels",
  "Polishing details",
];

export interface Processing3DProps {
  /** 0-100. When provided (inline/overlay), drives the SVG progress ring + %. */
  progress?: number;
  /** Brand tier — resolves accent color from brandCopy (falls back to cyan). */
  brand?: string;
  /** Explicit accent override (wins over brand). */
  accentHex?: string;
  variant?: "inline" | "tile" | "overlay";
  /** Cube edge in px. Default: inline 40, tile 30. */
  size?: "sm" | "md";
  /** Static caption (skip stage cycling) — e.g. per-scene status text. */
  label?: string;
  /** Secondary line under the label/stages (e.g. "2/4 complete • Tube.Pro"). */
  subLabel?: string;
  /** Custom cycling stages (inline/overlay). */
  stages?: string[];
  className?: string;
}

const STAGE_INTERVAL_MS = 1400;

function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return reduced;
}

function useStageIndex(stages: string[], active: boolean, frozen: boolean): number {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active || frozen || stages.length <= 1) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % stages.length),
      STAGE_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [active, frozen, stages.length]);
  return index % stages.length;
}

/* Injected once — unique p3d- prefixed keyframes/classes */
const P3D_CSS = `
.p3d-persp { perspective: 640px; }
.p3d-cube { position: relative; transform-style: preserve-3d;
  width: var(--p3d-size); height: var(--p3d-size);
  animation: p3d-tumble 5.2s cubic-bezier(.6,.05,.3,.95) infinite; }
.p3d-face { position: absolute; inset: 0; border-radius: 6px;
  border: 1px solid var(--p3d-accent);
  background: linear-gradient(135deg, var(--p3d-accent-soft), transparent 62%);
  box-shadow: inset 0 0 18px var(--p3d-accent-soft); }
.p3d-f1 { transform: translateZ(calc(var(--p3d-size) / 2)); }
.p3d-f2 { transform: rotateY(180deg) translateZ(calc(var(--p3d-size) / 2)); }
.p3d-f3 { transform: rotateY(90deg) translateZ(calc(var(--p3d-size) / 2)); }
.p3d-f4 { transform: rotateY(-90deg) translateZ(calc(var(--p3d-size) / 2)); }
.p3d-f5 { transform: rotateX(90deg) translateZ(calc(var(--p3d-size) / 2)); }
.p3d-f6 { transform: rotateX(-90deg) translateZ(calc(var(--p3d-size) / 2)); }
@keyframes p3d-tumble {
  0%   { transform: rotateX(-18deg) rotateY(0deg); }
  50%  { transform: rotateX(14deg) rotateY(180deg); }
  100% { transform: rotateX(-18deg) rotateY(360deg); } }
.p3d-beam { position: absolute; left: -30%; width: 160%; height: 22%; top: -25%;
  pointer-events: none; filter: blur(2px);
  background: linear-gradient(to bottom, transparent, var(--p3d-accent-glow), transparent);
  animation: p3d-scan 2.1s ease-in-out infinite; }
@keyframes p3d-scan {
  0% { top: -25%; opacity: 0; } 15% { opacity: 1; }
  85% { opacity: 1; } 100% { top: 105%; opacity: 0; } }
.p3d-glow { position: absolute; inset: -28%; border-radius: 9999px; pointer-events: none;
  background: radial-gradient(circle, var(--p3d-accent-soft), transparent 68%); }
.p3d-stage-text { animation: p3d-text-in .45s ease both; }
@keyframes p3d-text-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; } }
.p3d-ring-fg { transition: stroke-dashoffset .45s ease; }
@media (prefers-reduced-motion: reduce) {
  .p3d-cube, .p3d-beam, .p3d-stage-text { animation: none !important; } }
`;

let p3dInjected = false;
function useInjectStyles(): void {
  useEffect(() => {
    if (p3dInjected || typeof document === "undefined") return;
    if (!document.getElementById("p3d-style")) {
      const el = document.createElement("style");
      el.id = "p3d-style";
      el.textContent = P3D_CSS;
      document.head.appendChild(el);
    }
    p3dInjected = true;
  }, []);
}

/** Tumbling 3D cube + scan beam + ambient glow (pure CSS). */
function Cube({ edge, vars }: { edge: number; vars: React.CSSProperties }) {
  return (
    <div className="p3d-persp relative grid place-items-center" style={{ width: edge * 2.1, height: edge * 2.1 }}>
      <div className="p3d-glow" style={vars} />
      <div className="p3d-cube" style={vars}>
        {["p3d-f1", "p3d-f2", "p3d-f3", "p3d-f4", "p3d-f5", "p3d-f6"].map((f) => (
          <div key={f} className={cn("p3d-face", f)} />
        ))}
      </div>
      <div className="p3d-beam" style={vars} />
    </div>
  );
}

/** SVG progress ring with centered percentage. */
function Ring({ progress, diameter, vars }: { progress: number; diameter: number; vars: React.CSSProperties }) {
  const clamped = Math.min(100, Math.max(0, progress));
  const r = 46;
  const circ = 2 * Math.PI * r;
  return (
    <div className="absolute inset-0 grid place-items-center" style={vars}>
      <svg viewBox="0 0 100 100" width={diameter} height={diameter} className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="4.5" />
        <circle
          className="p3d-ring-fg"
          cx="50" cy="50" r={r} fill="none"
          stroke="var(--p3d-accent)" strokeWidth="4.5" strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - clamped / 100)}
        />
      </svg>
      <span className="absolute bottom-1 right-1 text-[10px] font-mono text-muted-foreground">
        {Math.round(clamped)}%
      </span>
    </div>
  );
}

export function Processing3D({
  progress,
  brand,
  accentHex,
  variant = "inline",
  size = "md",
  label,
  subLabel,
  stages = DEFAULT_STAGES,
  className,
}: Processing3DProps) {
  useInjectStyles();
  const accent = accentHex ?? brandCopy(brand ?? "").accentHex;
  const reduced = usePrefersReducedMotion();
  const cycling = !label && variant !== "tile";
  const stageIndex = useStageIndex(stages, cycling, reduced);

  const edge = variant === "tile" ? (size === "sm" ? 22 : 30) : 40;
  const vars = {
    "--p3d-size": `${edge}px`,
    "--p3d-accent": accent,
    "--p3d-accent-soft": `${accent}26`,
    "--p3d-accent-glow": `${accent}59`,
    color: accent,
  } as React.CSSProperties;

  const caption = label ?? stages[stageIndex];

  const composite = (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)} style={vars}>
      <div className="relative grid place-items-center" style={{ width: edge * 3.1, height: edge * 3.1 }}>
        <Cube edge={edge} vars={vars} />
        {typeof progress === "number" && variant !== "tile" && (
          <Ring progress={progress} diameter={edge * 3.1} vars={vars} />
        )}
      </div>
      {(cycling || label) && (
        <p key={cycling ? stageIndex : "static"} className="p3d-stage-text text-xs font-medium text-foreground/90 text-center">
          {caption}
          {cycling && !reduced ? "…" : ""}
        </p>
      )}
      {subLabel && <p className="text-[11px] text-muted-foreground text-center -mt-1.5">{subLabel}</p>}
    </div>
  );

  if (variant === "overlay") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
        <div className="rounded-2xl border border-border bg-card/90 px-10 py-8 shadow-2xl">
          {composite}
        </div>
      </div>
    );
  }

  return composite;
}

export default Processing3D;
