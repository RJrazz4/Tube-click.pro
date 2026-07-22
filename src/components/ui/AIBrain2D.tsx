/**
 * Phase G5 — AIBrain2D: premium 2D "AI thinking" animation for text processing phase.
 *
 * A pulsing neural network visualization representing the AI brain analyzing
 * the script, planning scenes, and crafting prompts. Pure CSS/SVG, zero deps.
 *
 * Variants:
 *   - "inline" — compact for cards/sections
 *   - "overlay" — fullscreen modal with glass card
 *   - "compact" — minimal horizontal bar for tight spaces
 *
 * Respects prefers-reduced-motion.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const NEURON_COUNT = 12;
const CONNECTION_COUNT = 18;
const PHASES = [
  "Reading script…",
  "Analyzing narrative structure…",
  "Identifying visual beats…",
  "Crafting scene prompts…",
  "Optimizing for generation…",
];

const P2D_CSS = `
.p2d-container { position: relative; isolation: isolate; }
.p2d-svg { width: 100%; height: 100%; display: block; }
.p2d-connection {
  stroke: var(--p2d-accent);
  stroke-opacity: 0;
  stroke-width: 1.2;
  stroke-linecap: round;
  filter: drop-shadow(0 0 3px var(--p2d-accent-glow));
  animation: p2d-pulse 2.4s ease-in-out infinite;
}
.p2d-neuron {
  r: var(--p2d-neuron-r);
  fill: var(--p2d-accent);
  filter: drop-shadow(0 0 4px var(--p2d-accent-glow));
  animation: p2d-neuron-pulse 1.8s ease-in-out infinite;
}
.p2d-neuron-core {
  r: calc(var(--p2d-neuron-r) * 0.45);
  fill: var(--p2d-bg);
}
@keyframes p2d-pulse {
  0%, 100% { stroke-opacity: 0.15; stroke-width: 1; }
  50% { stroke-opacity: 0.7; stroke-width: 2; }
}
@keyframes p2d-neuron-pulse {
  0%, 100% { r: var(--p2d-neuron-r); opacity: 0.85; }
  50% { r: calc(var(--p2d-neuron-r) * 1.35); opacity: 1; }
}
.p2d-phase-text {
  animation: p2d-text-in 0.5s ease both;
  font-variant-numeric: tabular-nums;
}
@keyframes p2d-text-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to { opacity: 1; transform: none; }
}

/* Compact variant bar sweep */
.p2d-bar {
  animation: p2d-bar-sweep 2.2s ease-in-out infinite;
}
@keyframes p2d-bar-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}

@media (prefers-reduced-motion: reduce) {
  .p2d-connection, .p2d-neuron, .p2d-phase-text, .p2d-bar { animation: none !important; }
  .p2d-connection { stroke-opacity: 0.35; }
  .p2d-neuron { opacity: 0.9; }
}
`;

let p2dInjected = false;
function useInjectStyles() {
  useEffect(() => {
    if (p2dInjected || typeof document === "undefined") return;
    if (!document.getElementById("p2d-style")) {
      const el = document.createElement("style");
      el.id = "p2d-style";
      el.textContent = P2D_CSS;
      document.head.appendChild(el);
    }
    p2dInjected = true;
  }, []);
}

interface Neuron {
  x: number;
  y: number;
  delay: number;
  size: number;
}

interface Connection {
  from: number;
  to: number;
  delay: number;
}

// Type that allows CSS custom properties (--*) in style objects
type CSSPropertiesWithVars = React.CSSProperties & Record<string, string | number>;

/** Deterministic pseudo-random for consistent layout */
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateNeuralNetwork(seed: number, width: number, height: number, count: number): Neuron[] {
  const neurons: Neuron[] = [];
  const margin = 40;
  for (let i = 0; i < count; i++) {
    const x = margin + seededRandom(seed + i * 7) * (width - margin * 2);
    const y = margin + seededRandom(seed + i * 13) * (height - margin * 2);
    neurons.push({
      x,
      y,
      delay: seededRandom(seed + i * 19) * 2000,
      size: 4 + seededRandom(seed + i * 23) * 5,
    });
  }
  return neurons;
}

function generateConnections(neurons: Neuron[], count: number, seed: number): Connection[] {
  const connections: Connection[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor(seededRandom(seed + i * 31) * neurons.length);
    let to = Math.floor(seededRandom(seed + i * 37) * neurons.length);
    if (to === from) to = (to + 1) % neurons.length;
    connections.push({
      from,
      to,
      delay: seededRandom(seed + i * 41) * 1500,
    });
  }
  return connections;
}

interface AIBrain2DProps {
  /** Brand tier — resolves accent color. */
  brand?: string;
  /** Explicit accent override (wins over brand). */
  accentHex?: string;
  variant?: "inline" | "overlay" | "compact";
  /** Custom cycling phases. */
  phases?: string[];
  /** Static label (skips phase cycling). */
  label?: string;
  /** Secondary sub-label. */
  subLabel?: string;
  className?: string;
}

export function AIBrain2D({
  brand,
  accentHex,
  variant = "inline",
  phases = PHASES,
  label,
  subLabel,
  className,
}: AIBrain2DProps) {
  useInjectStyles();
  const accent = accentHex ?? (brand ? `hsl(var(--${brand}-accent))` : "#06b6d4");
  const reduced = typeof window !== "undefined"
    ? window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    : false;

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [layout, setLayout] = useState<{ neurons: Neuron[]; connections: Connection[] } | null>(null);

  // Generate deterministic neural network layout
  useEffect(() => {
    if (variant === "compact") return;
    const w = variant === "overlay" ? 320 : 200;
    const h = variant === "overlay" ? 200 : 120;
    const neurons = generateNeuralNetwork(42, w, h, NEURON_COUNT);
    const connections = generateConnections(neurons, CONNECTION_COUNT, 42);
    setLayout({ neurons, connections });
  }, [variant]);

  // Phase cycling
  useEffect(() => {
    if (label || reduced || variant === "compact") return;
    const id = window.setInterval(
      () => setPhaseIndex((i) => (i + 1) % phases.length),
      1800,
    );
    return () => window.clearInterval(id);
  }, [label, reduced, variant, phases.length]);

  const currentPhase = label ?? phases[phaseIndex];

  if (variant === "overlay") {
    const containerStyle: CSSPropertiesWithVars = { width: 320, height: 200 };
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm">
        <div className="rounded-2xl border border-border bg-card/95 px-10 py-8 shadow-2xl max-w-md w-full mx-4">
          <div className="p2d-container" style={containerStyle}>
            {layout && <NeuralNetworkSVG layout={layout} accent={accent} />}
          </div>
          <div className="mt-6 text-center space-y-2">
            <p className="p2d-phase-text text-base font-medium text-foreground">{currentPhase}</p>
            {!reduced && !label && <span className="text-xs text-muted-foreground">…</span>}
            {subLabel && <p className="text-sm text-muted-foreground">{subLabel}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    const accentStyle: CSSPropertiesWithVars = { "--p2d-accent": accent };
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <div className="relative w-40 h-8" style={accentStyle}>
          <svg className="p2d-svg" viewBox="0 0 160 32" preserveAspectRatio="none">
            <defs>
              <linearGradient id="p2d-bar-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
                <stop offset="50%" stopColor="currentColor" stopOpacity="0.6" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.15" />
              </linearGradient>
            </defs>
            <rect
              className={cn("p2d-bar", reduced && "p2d-bar-reduced")}
              x="2"
              y="2"
              width="156"
              height="28"
              rx="14"
              fill="url(#p2d-bar-gradient)"
            />
          </svg>
        </div>
        <p className="p2d-phase-text text-sm font-medium text-foreground whitespace-nowrap">
          {currentPhase}
        </p>
      </div>
    );
  }

  // Inline variant
  const inlineContainerStyle: CSSPropertiesWithVars = { width: 200, height: 120 };
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="p2d-container relative" style={inlineContainerStyle}>
        {layout && <NeuralNetworkSVG layout={layout} accent={accent} />}
      </div>
      <p className="p2d-phase-text text-xs font-medium text-foreground text-center">{currentPhase}</p>
      {!reduced && !label && <span className="text-[10px] text-muted-foreground">…</span>}
      {subLabel && <p className="text-[10px] text-muted-foreground text-center -mt-1">{subLabel}</p>}
    </div>
  );
}

function NeuralNetworkSVG({
  layout,
  accent,
}: {
  layout: { neurons: Neuron[]; connections: Connection[] };
  accent: string;
}) {
  const vars: CSSPropertiesWithVars = {
    "--p2d-accent": accent,
    "--p2d-accent-glow": `${accent}99`,
    "--p2d-bg": "hsl(var(--background))",
    "--p2d-neuron-r": "0",
  };

  return (
    <svg
      className="p2d-svg"
      viewBox="0 0 200 120"
      preserveAspectRatio="xMidYMid meet"
      style={vars}
      aria-hidden="true"
    >
      {/* Connections */}
      <g stroke="var(--p2d-accent)">
        {layout.connections.map((conn, i) => {
          const from = layout.neurons[conn.from];
          const to = layout.neurons[conn.to];
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          const cpX = midX + (from.y - to.y) * 0.15;
          const cpY = midY + (to.x - from.x) * 0.15;
          const pathStyle: CSSPropertiesWithVars = {
            animationDelay: `${conn.delay}ms`,
            "--p2d-neuron-r": `${from.size}px`,
          };
          return (
            <path
              key={i}
              className="p2d-connection"
              d={`M${from.x},${from.y} Q${cpX},${cpY} ${to.x},${to.y}`}
              style={pathStyle}
            />
          );
        })}
      </g>

      {/* Neurons */}
      <g>
        {layout.neurons.map((neuron, i) => {
          const neuronStyle: CSSPropertiesWithVars = { animationDelay: `${neuron.delay}ms` };
          const circleStyle: CSSPropertiesWithVars = { "--p2d-neuron-r": `${neuron.size}px` };
          return (
            <g key={i} style={neuronStyle} transform={`translate(${neuron.x},${neuron.y})`}>
              <circle className="p2d-neuron" r={neuron.size} style={circleStyle} />
              <circle className="p2d-neuron-core" r={neuron.size * 0.45} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export default AIBrain2D;