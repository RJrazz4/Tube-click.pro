import { useEffect, useState } from "react";

const BOOT_LINES = [
  { text: "> INITIALIZING GHOST PROTOCOL v4.2...", delay: 180 },
  { text: "> ESTABLISHING ENCRYPTED UPLINK TO MUM-01...", delay: 320 },
  { text: "> BYPASSING YOUTUBE VEIL LAYER...", delay: 280 },
  { text: "> NEURAL LINK: STABLE (87ms) • SECURE TUNNEL ACTIVE", delay: 350 },
  { text: "> SCANNING COMPETITOR VELOCITY MATRIX...", delay: 300 },
  { text: "> CLEARANCE: LEVEL 4 GRANTED • GHOST NODE SYNCED", delay: 400 },
];

interface GhostBootProps {
  onComplete?: () => void;
  autoHide?: boolean;
}

export function GhostBootSequence({ onComplete, autoHide = true }: GhostBootProps) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState(0);
  const [typed, setTyped] = useState("");
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    if (currentLine >= BOOT_LINES.length) {
      setIsDone(true);
      if (autoHide) {
        const t = setTimeout(() => onComplete?.(), 800);
        return () => clearTimeout(t);
      }
      onComplete?.();
      return;
    }

    const line = BOOT_LINES[currentLine];
    let charIdx = 0;
    const full = line.text;

    const typeInterval = setInterval(() => {
      if (charIdx <= full.length) {
        setTyped(full.slice(0, charIdx));
        charIdx++;
      } else {
        clearInterval(typeInterval);
        setVisibleLines(prev => [...prev, full]);
        setTyped("");
        setTimeout(() => setCurrentLine(c => c + 1), line.delay);
      }
    }, 18); // fast typewriter, lightweight

    return () => clearInterval(typeInterval);
  }, [currentLine, autoHide, onComplete]);

  if (isDone && autoHide) return null;

  return (
    <div className="ghost-boot font-mono text-[11px] bg-black/90 border border-primary/20 rounded-xl p-3.5 overflow-hidden relative">
      {/* Scanline */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04] ghost-scanline" />
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-primary/10">
        <span className="text-primary font-bold tracking-widest text-[10px]">GHOST PROTOCOL BOOT • NODE MUM-01</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[9px] text-green-400">SECURE</span>
        </span>
      </div>
      <div className="space-y-1 min-h-[110px]">
        {visibleLines.map((l, i) => (
          <div key={i} className="text-green-400/80 tracking-wide">
            {l} <span className="text-green-400">✓</span>
          </div>
        ))}
        {currentLine < BOOT_LINES.length && (
          <div className="text-cyan-300 tracking-wide">
            {typed}
            <span className="inline-block w-[6px] h-[12px] bg-cyan-400 ml-0.5 animate-pulse translate-y-[2px]" />
          </div>
        )}
      </div>
      {/* Fake node dots */}
      <div className="mt-2 flex items-center gap-1.5">
        {[0,1,2,3].map(i => (
          <span key={i} className="w-1 h-1 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: `${i*180}ms` }} />
        ))}
        <span className="text-[9px] text-muted-foreground ml-1">Edge mesh syncing...</span>
      </div>
    </div>
  );
}
