import { useEffect, useRef } from "react";

/**
 * Particle Burst - Dopamine confetti, zero-budget, lightweight canvas
 * Triggers on Chain-Loop complete, copy, etc.
 * Vanilla JS, no lib, <2kb, 1.2s animation
 */

export function ParticleBurst({ trigger, colors = ["#A855F7", "#22D3EE", "#10B981"] }: { trigger: number; colors?: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (trigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const particles: { x: number; y: number; vx: number; vy: number; r: number; color: string; life: number }[] = [];
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    for (let i = 0; i < 28; i++) {
      const angle = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.3;
      const speed = 2 + Math.random() * 6;
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 2,
        r: 1.5 + Math.random() * 3.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
      });
    }

    let raf = 0;
    const start = performance.now();
    const duration = 1200;

    const draw = (now: number) => {
      const elapsed = now - start;
      const progress = elapsed / duration;
      if (progress >= 1) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18; // gravity
        p.vx *= 0.98; // friction
        p.life = 1 - progress;

        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(raf);
  }, [trigger, colors]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-20" />;
}
