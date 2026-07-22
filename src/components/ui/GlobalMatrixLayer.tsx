import { useEffect, useRef } from "react";

/**
 * Global Matrix Layer - $0 Stealth Command Center background
 * Behind entire app: matrix rain 3% opacity + noise + scanline + orbs
 * Lightweight: 1 canvas, RAF, 14px font, 0.4 drop speed
 */

export function GlobalMatrixLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let drops: number[] = [];
    const chars = "01";
    const fontSize = 14;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cols = Math.floor(canvas.width / fontSize);
      drops = Array(cols).fill(0).map(() => Math.random() * -20);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    const draw = () => {
      // Fade
      ctx.fillStyle = "rgba(2, 2, 7, 0.06)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(124, 58, 237, 0.55)";
      ctx.font = `${fontSize}px monospace`;
      drops.forEach((y, i) => {
        // Alternate cyan/purple
        ctx.fillStyle = i % 3 === 0 ? "rgba(34,211,238,0.5)" : "rgba(168,85,247,0.35)";
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, y * fontSize);
        if (y * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        else drops[i] = y + 0.4;
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="global-matrix-layer fixed inset-0 -z-50 pointer-events-none overflow-hidden">
      {/* Base black */}
      <div className="absolute inset-0 bg-[#020207]" />
      {/* Matrix canvas - 3% opacity illusion */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-[0.04]" />
      {/* Purple orb */}
      <div className="absolute -top-40 -left-40 w-[800px] h-[800px] rounded-full bg-purple-600/[0.07] blur-[100px]" />
      {/* Cyan orb */}
      <div className="absolute -bottom-60 -right-60 w-[700px] h-[700px] rounded-full bg-cyan-400/[0.05] blur-[120px]" />
      {/* Center radial fade */}
      <div className="absolute inset-0 bg-radial-vignette opacity-80" />
      {/* Scanline global - 2% */}
      <div className="absolute inset-0 ghost-scanline opacity-[0.02]" />
      {/* Noise - 1% */}
      <div className="absolute inset-0 noise opacity-[0.008]" />
      {/* Grid - 1.5% */}
      <div className="absolute inset-0 ghost-grid opacity-[0.015]" />
    </div>
  );
}
