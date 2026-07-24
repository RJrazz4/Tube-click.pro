import { useMemo, useState } from "react";
import { Activity, Clock3, Info, Radar, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Signal = { label: string; value: number; detail: string };

function buildSignals(topic: string): Signal[] {
  const words = topic.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const joined = words.join(" ");
  const hasCreatorIntent = /(youtube|video|channel|creator|content|shorts)/.test(joined);
  const hasOutcome = /(grow|learn|make|build|best|how|guide|tips|strategy)/.test(joined);
  const hasSpecificity = /\d|202\d|beginner|advanced|for /.test(joined);
  const base = Math.min(88, 35 + words.length * 4);
  return [
    { label: "Topic clarity", value: Math.min(96, base + (hasCreatorIntent ? 14 : 0)), detail: hasCreatorIntent ? "Creator intent is explicit." : "Add the audience or content format." },
    { label: "Action intent", value: Math.min(94, 40 + (hasOutcome ? 32 : 0)), detail: hasOutcome ? "The wording suggests a practical outcome." : "Add a verb that describes the desired result." },
    { label: "Specificity", value: Math.min(95, 38 + (hasSpecificity ? 35 : 0)), detail: hasSpecificity ? "A defined audience, year, or quantity is present." : "Try a concrete audience, timeframe, or quantity." },
    { label: "Audience signal", value: Math.min(92, 42 + (hasCreatorIntent ? 24 : 0) + (hasOutcome ? 12 : 0)), detail: "Calculated from audience and outcome language." },
  ];
}

export function LocalSignalBoard() {
  const [topic, setTopic] = useState("YouTube channel growth");
  const [scannedTopic, setScannedTopic] = useState(topic);
  const signals = useMemo(() => buildSignals(scannedTopic), [scannedTopic]);
  const scannedAt = new Date().toLocaleTimeString();
  return <Card className="glass-strong border-cyan-400/15"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="font-display text-base flex items-center gap-2"><Radar className="h-4 w-4 text-cyan-300" />Local Signal Board</CardTitle><p className="text-xs text-muted-foreground mt-1">Pattern signals from your topic—not live market data or a view prediction.</p></div><Info className="h-4 w-4 text-muted-foreground" aria-label="Signals are calculated locally" /></div></CardHeader><CardContent className="space-y-4"><div className="flex gap-2"><Input value={topic} onChange={(event) => setTopic(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setScannedTopic(topic); }} aria-label="Topic to scan" className="bg-background/50" /><Button onClick={() => setScannedTopic(topic)} className="gap-2"><RefreshCw className="h-4 w-4" />Scan</Button></div><div className="grid grid-cols-2 lg:grid-cols-4 gap-2">{signals.map((signal) => <div key={signal.label} className="rounded-xl border border-border/50 bg-secondary/25 p-3"><div className="flex justify-between gap-2"><p className="text-xs font-medium text-foreground">{signal.label}</p><span className="text-sm font-bold text-cyan-300">{signal.value}</span></div><div className="mt-2 h-1 rounded-full bg-secondary"><div className="h-1 rounded-full bg-cyan-400" style={{ width: `${signal.value}%` }} /></div><p className="mt-2 text-[10px] leading-snug text-muted-foreground">{signal.detail}</p></div>)}</div><p className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground/70"><Activity className="h-3 w-3 text-cyan-300" />LOCAL PATTERN SIGNAL • {scannedTopic || "No topic"} • <Clock3 className="h-3 w-3" /> {scannedAt}</p></CardContent></Card>;
}
