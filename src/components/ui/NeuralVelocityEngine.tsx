import { useMemo } from "react";

/**
 * Neural Velocity Engine - Simulated AI Intel, Zero Budget
 * Client-side heuristic - calculates retention, clickbait, viral velocity from title
 * Looks like $500/mo AI analysis, costs 0ms, no API
 */

interface Props {
  title: string;
  niche?: string;
  views?: number;
  compact?: boolean;
}

function calculateMetrics(title: string, niche = "", views = 0) {
  const lower = title.toLowerCase();
  const words = title.split(/\s+/).filter(Boolean);
  const powerWords = ["secret", "exposed", "hidden", "banned", "truth", "shocking", "mistake", "revealed", "warning", "urgent", "finally", "never", "why", "how", "what", "at", "you"];
  const powerCount = powerWords.filter(w => lower.includes(w)).length;
  const hasNumber = /\d+/.test(title) ? 15 : 0;
  const hasBracket = /\[.*?\]|\(.*?\)/.test(title) ? 10 : 0;
  const lengthScore = Math.min(100, Math.max(20, 100 - Math.abs(words.length - 7) * 8));
  const powerScore = Math.min(100, powerCount * 18 + hasNumber + hasBracket);
  const curiosityGap = lower.includes("?") || lower.includes("...") || lower.includes("nobody") ? 85 : 60 + powerCount * 5;
  const retentionProb = Math.min(95, Math.round(35 + lengthScore * 0.3 + powerScore * 0.4 + (views > 0 ? Math.log10(views) * 2 : 0)));
  const clickbaitIndex = Math.min(100, Math.round(powerScore * 0.7 + hasNumber + (title.length < 60 ? 10 : 0)));
  const viralVelocity = Math.min(100, Math.round((retentionProb * 0.4 + clickbaitIndex * 0.4 + lengthScore * 0.2)));
  const nicheBonus = niche ? 5 : 0;

  return {
    retentionProb: Math.min(100, retentionProb + nicheBonus),
    clickbaitIndex: Math.min(100, clickbaitIndex + nicheBonus),
    curiosityGap: Math.min(100, curiosityGap),
    lengthScore,
    viralVelocity,
    powerCount,
    grade: viralVelocity >= 85 ? "S" : viralVelocity >= 70 ? "A" : viralVelocity >= 55 ? "B" : "C",
  };
}

export function NeuralVelocityEngine({ title, niche = "", views = 0, compact = false }: Props) {
  const metrics = useMemo(() => calculateMetrics(title, niche, views), [title, niche, views]);

  if (compact) {
    return (
      <div className="flex items-center gap-2 font-mono text-[10px]">
        <span className={`px-1.5 py-0.5 rounded border font-bold ${metrics.grade === "S" ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : metrics.grade === "A" ? "bg-green-500/10 text-green-300 border-green-500/20" : "bg-primary/10 text-primary border-primary/20"}`}>GRADE {metrics.grade} • {metrics.viralVelocity}</span>
        <span className="text-muted-foreground">RET {metrics.retentionProb}% • CTR {metrics.clickbaitIndex}% • GHOST CALC</span>
      </div>
    );
  }

  const bars = [
    { label: "Retention Prob", value: metrics.retentionProb, color: "from-green-400 to-emerald-500" },
    { label: "Clickbait Index", value: metrics.clickbaitIndex, color: "from-amber-400 to-orange-500" },
    { label: "Curiosity Gap", value: metrics.curiosityGap, color: "from-purple-400 to-pink-500" },
    { label: "Viral Velocity", value: metrics.viralVelocity, color: "from-cyan-400 to-blue-500" },
  ];

  return (
    <div className="neural-engine rounded-xl glass-strong border-primary/15 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Neural Velocity Engine • Ghost Calc • Zero API
        </p>
        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${metrics.grade === "S" ? "bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse" : "bg-primary/10 text-primary border-primary/20"}`}>GRADE {metrics.grade} • {metrics.viralVelocity}/100</span>
      </div>

      <div className="space-y-2.5">
        {bars.map(bar => (
          <div key={bar.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-muted-foreground">{bar.label}</span>
              <span className="text-[10px] font-mono font-bold text-foreground">{bar.value}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r ${bar.color} transition-all duration-700`} style={{ width: `${bar.value}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground/60 pt-1 border-t border-border/20">
        <span>Power words: {metrics.powerCount}</span>
        <span className="text-border">•</span>
        <span>Heuristic • Client-side • MUM-01 • 0ms • No LLM cost</span>
        <span className="ml-auto text-primary/50">Ghost • Encrypted</span>
      </div>
    </div>
  );
}
