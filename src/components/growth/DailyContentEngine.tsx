import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ClipboardList,
  Copy,
  Film,
  Hash,
  Loader2,
  Lock,
  Mic,
  Play,
  Quote,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Tag,
  Video,
  Waves,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDailyContent, useGenerateDailyContent } from "@/hooks/useEngineData";
import { useIsPro } from "@/stores/useAuthStore";
import { useProUpgrade } from "@/contexts/ProUpgradeContext";
import type { CompetitorGap, DailyPackage } from "@/lib/engine/types";

/**
 * Dual-LLM Daily Content Engine — the frontend surface.
 *
 * Reads the Editor-approved package (never the raw Generator output) from
 * GET /api/content/daily. Free sees a Short package; Pro sees Short + Long.
 * The pipeline (LLM 1 Generator → LLM 2 Editor/Validator) runs behind the
 * scenes; only LLM 2's audited & rewritten package is shown here.
 */
export function DailyContentEngine({ connected, competitorGap }: { connected: boolean; competitorGap: CompetitorGap }) {
  const isPro = useIsPro();
  const { openProUpgrade } = useProUpgrade();
  const daily = useDailyContent(connected);
  const trigger = useGenerateDailyContent();
  const record = daily.data ?? null;
  const [tab, setTab] = useState<"short" | "long">("short");
  const gen = () => trigger.mutate(competitorGap);

  useEffect(() => {
    if (daily.error) {
      const msg = daily.error.message ?? "";
      if (msg.includes("not configured") || msg.includes("MODULE_DISABLED")) {
        toast.error("Daily content engine is not configured", { description: "The LLM gateway has no keys yet." });
      } else if (msg.includes("No daily package")) {
        // expected — not generated yet
      } else {
        toast.error(msg);
      }
    }
  }, [daily.error]);

  const activePackage: DailyPackage | undefined = record
    ? tab === "long" ? (record.result.long ?? record.result.short) : record.result.short
    : undefined;

  return (
    <Card className="glass-strong bracket border-primary/20 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 via-transparent to-cyan-400/10" />
      <CardHeader className="relative pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 font-display text-lg">
            <BrainCircuit className="h-5 w-5 text-fuchsia-400" /> Daily Content Engine
          </CardTitle>
          <Badge variant="outline" className={cn("gap-1.5 text-[9px] font-mono uppercase tracking-wider", record ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400")}>
            {record ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />}
            {record ? `Ready · ${record.date}` : "Awaiting today's trigger"}
          </Badge>
        </div>
        <CardDescription>
          One targeted package per day — LLM Generator drafts it, the Editor/Validator rewrites & approves the opening before you see it.
        </CardDescription>
      </CardHeader>
      <CardContent className="relative space-y-4">
        {/* Dual-LLM pipeline strip */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <PipelineStep icon={Bot} label="LLM 1 · Generator" active={!!record} />
          <PipelineStep icon={BrainCircuit} label="LLM 2 · Editor" active={!!record} accent />
          <PipelineStep icon={ShieldCheck} label="You · approved" active={!!record} ready />
        </div>

        {record && isPro && record.result.long ? (
          <>
            <Tabs value={tab} onChange={setTab} shortVariant={record.result.short} longVariant={record.result.long} />
            {activePackage && <PackageViewer pkg={activePackage} report={tab === "long" ? record.reports.long : record.reports.short} />}
          </>
        ) : record ? (
          <PackageViewer pkg={record.result.short} report={record.reports.short} />
        ) : daily.isLoading ? (
          <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-secondary/25 p-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading today's package…
          </div>
        ) : !connected ? (
          <ActivationState label="Connect your YouTube channel to let the engine pick today's single best idea." />
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 p-6 text-center space-y-3">
            <Rocket className="mx-auto h-8 w-8 text-primary" />
            <p className="text-sm font-semibold text-foreground">No package for today yet</p>
            <p className="mx-auto max-w-md text-xs text-muted-foreground leading-relaxed">
              The engine will compute your audience demand against competitor gaps, draft a package with LLM 1,
              then have LLM 2 audit and rewrite the opening for maximum retention — all before you see it.
            </p>
            <Button className="cyber-button gap-2 text-xs font-display" disabled={trigger.isPending} onClick={gen}>
              {trigger.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 fill-primary-foreground" />}
              {trigger.isPending ? "Running dual-LLM pipeline…" : "Generate today's package"}
            </Button>
            <p className="text-[10px] font-mono text-muted-foreground/70">{isPro ? "Pro" : "Free"} tier · {isPro ? "Short + Long" : "Short"} · dual-LLM validated</p>
          </div>
        )}

        {/* Regenerate (Pro) */}
        {record && isPro && (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" className="gap-2 text-[10px]" disabled={trigger.isPending} onClick={gen}>
              <RefreshCw className={cn("h-3 w-3", trigger.isPending && "animate-spin")} /> Regenerate today
            </Button>
            {!isPro && (
              <Button size="sm" variant="outline" className="gap-2 text-[10px]" onClick={() => openProUpgrade({ defaultTab: "payment", reason: "daily-content" })}>
                <Lock className="h-3 w-3" /> Unlock Long-form
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineStep({ icon: Icon, label, active, accent, ready }: { icon: any; label: string; active: boolean; accent?: boolean; ready?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center gap-1 rounded-xl border p-2", active ? "border-primary/30 bg-primary/10" : "border-border/40 bg-secondary/20 opacity-60")}>
      <Icon className={cn("h-4 w-4", active ? (ready ? "text-emerald-400" : accent ? "text-fuchsia-400" : "text-cyan-400") : "text-muted-foreground")} />
      <span className="text-[9px] font-mono leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

function Tabs({ value, onChange, shortVariant, longVariant }: { value: "short" | "long"; onChange: (v: "short" | "long") => void; shortVariant: DailyPackage; longVariant: DailyPackage }) {
  return (
    <div className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-border/60 bg-card/70 p-1">
      <button type="button" onClick={() => onChange("short")} className={cn("flex flex-col items-center gap-0.5 rounded-md px-3 py-2 transition-colors", value === "short" ? "bg-primary/15 text-primary border border-primary/30" : "border border-transparent text-muted-foreground hover:bg-secondary/60")}>
        <Video className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">Short</span>
        <span className="truncate text-[9px] font-mono text-muted-foreground">{shortVariant.title}</span>
      </button>
      <button type="button" onClick={() => onChange("long")} className={cn("flex flex-col items-center gap-0.5 rounded-md px-3 py-2 transition-colors", value === "long" ? "bg-primary/15 text-primary border border-primary/30" : "border border-transparent text-muted-foreground hover:bg-secondary/60")}>
        <Film className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">Long-form</span>
        <span className="truncate text-[9px] font-mono text-muted-foreground">{longVariant.title}</span>
      </button>
    </div>
  );
}

function PackageViewer({ pkg, report }: { pkg: DailyPackage; report?: { opening_rewritten: boolean; generic_intros_removed: string[]; hook_reason: string; approved: boolean } }) {
  const speak = useSpeech();
  const [speaking, setSpeaking] = useState(false);
  const copy = (text: string) => { void navigator.clipboard?.writeText(text); toast.success("Copied to clipboard"); };

  return (
    <div className="space-y-3">
      {/* editor validation chip */}
      {report && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2.5">
          <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="text-[10px] font-mono text-emerald-300">EDITOR-VALIDATED</span>
          {report.opening_rewritten ? (
            <span className="text-[10px] font-mono text-muted-foreground">Opening rewritten — {report.generic_intros_removed.length ? `removed: ${report.generic_intros_removed.join(", ")}` : "high-retention hook applied"}</span>
          ) : (
            <span className="text-[10px] font-mono text-muted-foreground">Opening passed the first-5s gate</span>
          )}
        </div>
      )}

      {/* title + hook */}
      <div className="rounded-xl border border-border/40 bg-secondary/20 p-3">
        <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">{pkg.format === "short" ? "Short video" : "Long-form video"}</p>
        <p className="mt-1 font-display text-base font-bold text-foreground leading-snug">{pkg.title}</p>
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/10 p-2.5">
          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />
          <p className="text-sm italic text-foreground leading-relaxed">“{pkg.hook.text}”</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { speak(pkg.hook.text); setSpeaking(true); setTimeout(() => setSpeaking(false), 3000); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors">
            {speaking ? <Waves className="h-3 w-3 animate-pulse" /> : <Play className="h-3 w-3" />}
            {speaking ? "Playing…" : "Hear the hook"}
          </button>
          <button type="button" onClick={() => copy(pkg.hook.text)} className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors">
            <Copy className="h-3 w-3" /> Copy hook
          </button>
        </div>
      </div>

      {/* script */}
      <div className="rounded-xl border border-border/40 bg-secondary/20 p-3">
        <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70"><ClipboardList className="h-3 w-3" /> Full script</p>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap">{pkg.script}</p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => copy(pkg.script)} className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"><Copy className="h-3 w-3" /> Copy script</button>
        </div>
      </div>

      {/* voiceover prompt */}
      <div className="rounded-xl border border-border/40 bg-secondary/20 p-3">
        <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70"><Mic className="h-3 w-3" /> Voiceover prompt</p>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground">{pkg.voiceover_prompt}</p>
      </div>

      {/* tags + description */}
      <div className="rounded-xl border border-border/40 bg-secondary/20 p-3">
        <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70"><Hash className="h-3 w-3" /> Tags</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {pkg.tags.map((t) => <Badge key={t} variant="outline" className="text-[9px] font-mono text-muted-foreground border-border/40">{t}</Badge>)}
        </div>
        <p className="mt-3 flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70"><ClipboardList className="h-3 w-3" /> Description</p>
        <p className="mt-1.5 text-xs leading-relaxed text-foreground">{pkg.description}</p>
      </div>

      {/* visual timeline / B-roll */}
      <div className="rounded-xl border border-border/40 bg-secondary/20 p-3">
        <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70"><Video className="h-3 w-3" /> Visual timeline · B-roll plan</p>
        <div className="mt-2 space-y-1.5">
          {pkg.visual_timeline.map((beat, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg border border-border/30 bg-card/40 p-2">
              <span className="shrink-0 font-mono text-[10px] text-cyan-300">{beat.at}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{beat.shot}</p>
                <p className="text-[10px] text-muted-foreground">B-roll · {beat.broll}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {pkg.thumbnail_text && (
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
          <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70"><Tag className="h-3 w-3" /> Thumbnail text</p>
          <p className="mt-1 text-sm font-display font-semibold text-foreground">{pkg.thumbnail_text}</p>
        </div>
      )}
    </div>
  );
}

function ActivationState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 p-6 text-center">
      <Rocket className="mx-auto h-8 w-8 text-muted-foreground/40" />
      <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground leading-relaxed">{label}</p>
    </div>
  );
}

function useSpeech() {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => {
      const v = window.speechSynthesis.getVoices();
      voiceRef.current = v.find((x) => x.lang.startsWith("en") && x.localService) ?? v.find((x) => x.lang.startsWith("en")) ?? null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  return (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { toast.error("Voice preview not supported"); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  };
}
