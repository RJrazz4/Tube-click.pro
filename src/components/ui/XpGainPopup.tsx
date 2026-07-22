import { useEffect, useState } from "react";

/**
 * XP Gain Popup - Dopamine burst, lightweight CSS animation
 * Shows +XP on Chain-Loop complete, copy, etc.
 */

export function XpGainPopup({ trigger, xp = 20, label = "XP" }: { trigger: number; xp?: number; label?: string }) {
  const [visible, setVisible] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (trigger === 0) return;
    setKey(k => k + 1);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 1800);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!visible) return null;

  return (
    <div key={key} className="xp-popup pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] animate-xp-float">
      <div className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-cyan-400 text-white px-4 py-2 shadow-[0_0_20px_rgba(139,92,246,0.5)] border border-white/20">
        <span className="text-lg">⚡</span>
        <span className="font-mono font-bold text-sm">+{xp} {label}</span>
        <span className="text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded-full">MUM-01</span>
      </div>
      <style>{`
        @keyframes xp-float {
          0% { transform: translate(-50%, -30%) scale(0.8); opacity: 0; }
          20% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
          80% { transform: translate(-50%, -80%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -110%) scale(0.9); opacity: 0; }
        }
        .animate-xp-float {
          animation: xp-float 1.8s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
