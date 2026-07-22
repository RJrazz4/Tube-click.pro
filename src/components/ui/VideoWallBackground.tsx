import { useEffect, useRef } from "react";

/**
 * Video Wall Background - $0 Matrix immersion
 * Blurred thumbnails + dark gradients + scanline + noise
 * Lightweight: CSS blur, not canvas video, zero API
 */

const THUMB_POOL = [
  "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg",
  "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg",
  "https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg",
  "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg",
  "https://i.ytimg.com/vi/CevxZvSJLk8/hqdefault.jpg",
  "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg",
  "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg",
  "https://i.ytimg.com/vi/hT_nvWreIhg/hqdefault.jpg",
  "https://i.ytimg.com/vi/YQHsXMglC9A/hqdefault.jpg",
  "https://i.ytimg.com/vi/NUsoVlDFqZg/hqdefault.jpg",
  "https://i.ytimg.com/vi/Zi_XLOBDo_Y/hqdefault.jpg",
];

export function VideoWallBackground({ intensity = "medium" }: { intensity?: "low" | "medium" | "high" }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    let mouseX = 0, mouseY = 0, curX = 0, curY = 0;

    const onMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 20;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 20;
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const loop = () => {
      curX += (mouseX - curX) * 0.04;
      curY += (mouseY - curY) * 0.04;
      if (el) el.style.transform = `translate3d(${curX}px, ${curY}px, 0) scale(1.12)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  const blurClass = intensity === "high" ? "blur-[22px]" : intensity === "medium" ? "blur-[16px]" : "blur-[10px]";
  const brightness = intensity === "high" ? "brightness-[0.14]" : intensity === "medium" ? "brightness-[0.20]" : "brightness-[0.35]";

  return (
    <div className="video-wall-bg fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base dark */}
      <div className="absolute inset-0 bg-[#020207]" />
      
      {/* Thumbnail grid - 12 images, CSS only, lightweight */}
      <div
        ref={containerRef}
        className={`absolute inset-[-10%] grid grid-cols-4 md:grid-cols-6 gap-[2px] ${blurClass} ${brightness} grayscale-[0.2] saturate-[0.6] will-change-transform`}
      >
        {THUMB_POOL.map((src, i) => (
          <div key={i} className="relative aspect-video overflow-hidden bg-black/40">
            <img
              src={src}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
        {/* Duplicate for seamless */}
        {THUMB_POOL.slice(0, 6).map((src, i) => (
          <div key={`dup-${i}`} className="relative aspect-video overflow-hidden bg-black/40 hidden md:block">
            <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          </div>
        ))}
      </div>

      {/* Dark gradients - push videos to background illusion */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#020207] via-[#020207]/90 to-[#020207]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#020207] via-transparent to-[#020207]/80" />
      {/* Purple orb */}
      <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-purple-600/15 blur-[80px] pointer-events-none" />
      {/* Cyan orb */}
      <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-400/10 blur-[90px] pointer-events-none" />
      {/* Vignette */}
      <div className="absolute inset-0 bg-radial-vignette" />
      {/* Scanline */}
      <div className="absolute inset-0 ghost-scanline opacity-[0.035]" />
      {/* Noise */}
      <div className="absolute inset-0 opacity-[0.015] noise" />
    </div>
  );
}
