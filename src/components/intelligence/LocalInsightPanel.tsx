import { useState } from "react";
import { CheckCircle2, Gauge, Lightbulb, ScanSearch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { analyzeTitleLocally, loadCachedInsight, saveCachedInsight, type LocalInsight } from "@/lib/intelligence/localAnalysis";

const sample = "How I Grew a YouTube Channel from 0 to 10,000 Subscribers";

export function LocalInsightPanel() {
  const [input, setInput] = useState(sample);
  const [insight, setInsight] = useState<LocalInsight | null>(() => loadCachedInsight(sample));

  const runAnalysis = () => {
    if (!input.trim()) return;
    const result = analyzeTitleLocally(input);
    saveCachedInsight(result);
    setInsight(result);
  };
  const average = insight ? Math.round(insight.signals.reduce((sum, signal) => sum + signal.score, 0) / insight.signals.length) : 0;

  return (
    <Card className="glass-strong border-primary/20 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div><CardTitle className="font-display text-base flex items-center gap-2"><ScanSearch className="h-4 w-4 text-primary" />Local Intelligence Brief</CardTitle><CardDescription>Fast editorial signals calculated in your browser. No request or upload required.</CardDescription></div>
          {insight && <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-center"><p className="text-[9px] font-mono text-muted-foreground">STRUCTURE SCORE</p><p className="text-xl font-display font-bold text-primary">{average}</p></div>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea value={input} onChange={(event) => setInput(event.target.value)} aria-label="Title to analyze" placeholder="Paste a title or hook…" className="min-h-20 resize-y bg-background/50" />
        <div className="flex flex-wrap gap-2"><Button onClick={runAnalysis} disabled={!input.trim()} className="cyber-button gap-2"><Gauge className="h-4 w-4" />Run local scan</Button><Button variant="ghost" size="sm" onClick={() => { setInput(sample); setInsight(loadCachedInsight(sample)); }}>Use sample</Button></div>
        {insight && <div className="space-y-3 animate-fade-in" aria-live="polite"><div className="grid grid-cols-2 sm:grid-cols-5 gap-2">{insight.signals.map((signal) => <div key={signal.key} className="rounded-lg border border-border/50 bg-secondary/30 p-2"><div className="flex items-center justify-between gap-1"><span className="text-[10px] text-muted-foreground">{signal.label}</span><span className="text-xs font-bold text-primary">{signal.score}</span></div><div className="mt-1 h-1 rounded-full bg-secondary"><div className="h-1 rounded-full bg-primary" style={{ width: `${signal.score}%` }} /></div></div>)}</div><div className="rounded-xl border border-border/50 bg-secondary/20 p-3"><p className="text-sm text-foreground flex items-start gap-2"><Lightbulb className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" />{insight.summary}</p><p className="text-xs text-muted-foreground mt-2">Next move: {insight.nextMove}</p><p className="text-[9px] font-mono text-muted-foreground/70 mt-3 flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-400" />LOCAL-RULES • cached in this browser • {new Date(insight.analyzedAt).toLocaleTimeString()}</p></div></div>}
      </CardContent>
    </Card>
  );
}
