import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Copy,
  Loader2,
  Lock,
  Play,
  Rocket,
  Sparkles,
  Target,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  synthesize,
  type BriefSignal,
  type CompetitorSignal,
  type OpportunityBrief,
  type VideoIdea,
  clamp,
} from "@/lib/growth/synthesis";
import { useGenerateScript, useAudienceBrief } from "@/hooks/useEngineData";
import { useIsPro } from "@/stores/useAuthStore";
import { useProUpgrade } from "@/contexts/ProUpgradeContext";

export interface AutomationEngineProps {
  connected: boolean;
  topSignals: BriefSignal[];
  geo: { name: string; value: number }[];
  heroRetention: number;
  competitorVelocity: number;
  competitorRevenue: number;
  niche: string;
  nicheCpm: string;
  competitorTop: CompetitorSignal | null;
  cadence: number; // 0..30
  packageCount: number;
  narrativeBrief: { headline: string; who: string; where_when: string; what_they_want: string[]; retention_truth: string; next_3_videos: Array<{ title_idea: string; why: string; hunger_topic: string }> } | null;
}

export function AutomationEngine(props: AutomationEngineProps) {
  const { connected, topSignals, geo, competitorTop, narrativeBrief } = props;
  const generate = useGenerateScript();
  const syn = useMemo(() => synthesize({
    topSignals, geo, heroRetention: props.heroRetention,
    competitorVelocity: props.competitorVelocity, competitorRevenue: props.competitorRevenue,
    niche: props.niche, nicheCpm: props.nicheCpm, competitorTop,
    cadence: props.cadence, packageCount: props.packageCount,
  }), [topSignals, geo, competitorTop, props]);

  const hasBrief = !!narrativeBrief;
  const topHungerTopic = topSignals[0]?.topic;
  const onGeneratePackage = () => {
    if (!topHungerTopic) {
      toast.error("Connect YouTube to generate a package from your top signal.");
      return;
    }
    generate.mutate(topHungerTopic);
  };

  return (
    <div className="space-y-4">
      {/* ═══ HERO — automated synthesis terminal ═══ */}
      <Card className="glass-strong bracket border-primary/20 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-cyan-400/10" />
        <CardHeader className="relative pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <BrainCircuit className="h-5 w-5 text-primary" /> Automation Engine
            </CardTitle>
            <Badge variant="outline" className={cn("gap-1.5 text-[9px] font-mono uppercase tracking-wider", syn.brief.ready ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400")}>
              {syn.brief.ready ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />}
              {syn.brief.ready ? "Synthesizing live" : "Awaiting data"}
            </Badge>
          </div>
          <CardDescription>Fetches your audience & competitor telemetry, crunches it, and makes the call for you.</CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <SynthesisFeed
            signalsReady={syn.brief.signalsReady}
            competitorsReady={syn.brief.competitorsReady}
            connected={connected}
            ideaCount={syn.ideas.length}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 font-display text-base md:text-lg font-bold text-foreground leading-snug">{syn.brief.headline}</p>
            {connected && topHungerTopic && (
              <Button size="sm" className="cyber-button gap-2 text-xs font-display shrink-0" disabled={generate.isPending} onClick={onGeneratePackage}>
                {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5 fill-primary-foreground" />}
                {generate.isPending ? "Generating…" : "Generate package"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══ Opportunity brief (the synthesized call) ═══ */}
      <div className="grid gap-4 md:grid-cols-2">
        <OpportunityBriefCard brief={syn.brief} connected={connected} />
        <div className="space-y-4">
          <IdeaStack ideas={syn.ideas} connected={connected} premiumBrief={narrativeBrief} />
          <PremiumBriefCard
            hasBrief={hasBrief}
            narrativeBrief={narrativeBrief}
            connected={connected}
          />
        </div>
      </div>

      {/* ═══ Activation guidance empty state ═══ */}
      {!syn.brief.ready && (
        <ActivationChecklist
          connected={connected}
          signalsReady={syn.brief.signalsReady}
          competitorsReady={syn.brief.competitorsReady}
        />
      )}
    </div>
  );
}

// ── terminal feed (auto-crunching, data-driven steps) ──────────────
function SynthesisFeed({ signalsReady, competitorsReady, connected, ideaCount }: { signalsReady: boolean; competitorsReady: boolean; connected: boolean; ideaCount: number }) {
  const steps = useMemo<{ label: string; probe: () => boolean; live?: boolean }[]>(() => [
    { label: "Authenticating engine link", probe: () => connected },
    { label: "Fetching 30-day audience signals", probe: () => signalsReady },
    { label: "Computing demand & view velocity", probe: () => ideaCount > 0 },
    { label: "Merging competitor gap analysis", probe: () => competitorsReady },
    { label: "Synthesizing opportunity brief & hooks", probe: () => ideaCount > 0 },
  ], [connected, signalsReady, ideaCount, competitorsReady]);

  const doneCount = steps.filter((s) => s.probe()).length;
  const running = connected && doneCount < steps.length && doneCount > 0;

  return (
    <div className="rounded-lg border border-border/60 bg-background/70 p-3 font-mono text-[11px] leading-relaxed">
      {steps.map((s, i) => {
        const done = s.probe();
        const live = running && i === doneCount;
        return (
          <div key={i} className={cn("flex items-center gap-2 transition-opacity duration-300", done || live ? "opacity-100" : "opacity-30")}>
            <span className="text-cyan-400/70">❯</span>
            <span className={live ? "text-cyan-300" : done ? "text-emerald-400" : "text-muted-foreground"}>{s.label}</span>
            {done && <CheckCircle2 className="ml-auto h-3 w-3 text-emerald-500" />}
            {live && <span className="ml-auto inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />}
          </div>
        );
      })}
      <div className="mt-1 flex items-center gap-2 text-emerald-400">❯ {running ? "crunching…" : doneCount === steps.length ? "decision ready" : "standby"}</div>
    </div>
  );
}

// ── opportunity brief card ─────────────────────────────────────────
function OpportunityBriefCard({ brief, connected }: { brief: OpportunityBrief; connected: boolean }) {
  const rows: { label: string; value: string }[] = [
    { label: "Top demand signal", value: brief.topDemandScore > 0 ? `${brief.topDemand} · ${brief.topDemandScore}/100` : "—" },
    { label: "Retention truth", value: brief.retentionTruth },
    { label: "Geo focus", value: brief.geoFocus },
    { label: "Biggest gap", value: brief.biggestGap },
    { label: "Cadence read", value: brief.cadenceRead },
  ];
  return (
    <Card className="cyber-card border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-base"><Target className="h-4 w-4 text-cyan-300" /> Decision brief</CardTitle>
        <CardDescription>The engine's synthesized read on your channel</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* gap meter */}
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--secondary)" strokeWidth="7" opacity="0.5" />
              <circle cx="32" cy="32" r="26" fill="none" stroke="#22d3ee" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 26} strokeDashoffset={2 * Math.PI * 26 * (1 - clamp(brief.gapScore) / 100)}
                style={{ transition: "stroke-dashoffset 1s ease", filter: "drop-shadow(0 0 5px #22d3ee66)" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-lg font-black text-foreground">{clamp(brief.gapScore)}</span>
              <span className="text-[7px] font-mono text-muted-foreground">GAP</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Competitive opening</p>
            <p className="text-[11px] font-mono text-cyan-300">{brief.monthlyGap > 0 ? `~$${fmtMoney(brief.monthlyGap)}/mo on the table` : "measuring…"}</p>
          </div>
        </div>
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-border/40 bg-secondary/25 p-2.5">
            <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">{r.label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground">{r.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── generated video ideas + hooks ──────────────────────────────────
function IdeaStack({ ideas, connected, premiumBrief }: { ideas: VideoIdea[]; connected: boolean; premiumBrief: AutomationEngineProps["narrativeBrief"] }) {
  const speak = useSpeech();
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success("Hook copied to clipboard");
  };
  // Prefer premium LLM next_3_videos when present (highest-quality insights),
  // otherwise use the locally synthesized ideas.
  const aiIdeas = premiumBrief?.next_3_videos;
  const useLlm = aiIdeas && aiIdeas.length > 0;

  if (!useLlm && !ideas.length) {
    return (
      <Card className="cyber-card border-border/60">
        <CardContent className="p-8 text-center">
          <Bot className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-xs text-muted-foreground">Ideas & hooks appear automatically once data is in.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="cyber-card border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <Zap className="h-4 w-4 text-fuchsia-400" /> Auto-generated content
        </CardTitle>
        <CardDescription>{useLlm ? "AI insights from your audience brief" : "Ideas synthesized from your live signals"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {useLlm
          ? aiIdeas!.map((v, i) => (
              <IdeaRow key={`llm-${i}`} rank={i + 1} title={v.title_idea} hook={v.why} angle={`${v.hunger_topic} · AI brief`} evidence={[{ label: "Why", value: v.why }]} speakingId={speakingId} setSpeaking={setSpeakingId} speak={speak} copy={copy} />
            ))
          : ideas.map((idea) => (
              <IdeaRow key={idea.id} rank={idea.rank} title={idea.title} hook={idea.hook} angle={idea.angle} evidence={idea.evidence} speakingId={speakingId} setSpeaking={setSpeakingId} speak={speak} copy={copy} />
            ))}
      </CardContent>
    </Card>
  );
}

function IdeaRow({ rank, title, hook, angle, evidence, speakingId, setSpeaking, speak, copy }: {
  rank: number;
  title: string;
  hook: string;
  angle: string;
  evidence: { label: string; value: string }[];
  speakingId: string | null;
  setSpeaking: (id: string | null) => void;
  speak: (text: string) => void;
  copy: (text: string) => void;
}) {
  const id = `idea-${rank}`;
  const isSpeaking = speakingId === id;
  return (
    <div className="rounded-xl border border-border/40 bg-secondary/20 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 font-mono text-[10px] font-bold text-primary">{rank}</span>
        <p className="min-w-0 flex-1 text-sm font-semibold text-foreground leading-snug">{title}</p>
      </div>
      <p className="mt-1.5 ml-7 text-xs italic text-muted-foreground leading-relaxed">“{hook}”</p>
      <p className="mt-1.5 ml-7 text-[11px] text-cyan-300/90 leading-relaxed">{angle}</p>
      <div className="mt-2 ml-7 flex flex-wrap gap-1.5">
        {evidence.map((e) => (
          <Badge key={e.label} variant="outline" className="text-[9px] font-mono text-muted-foreground border-border/40">{e.label}: {e.value}</Badge>
        ))}
      </div>
      <div className="mt-2 ml-7 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { if (isSpeaking) { speak(""); setSpeaking(null); } else { setSpeaking(id); speak(hook); } }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors"
        >
          {isSpeaking ? <Waves className="h-3 w-3 animate-pulse" /> : <Play className="h-3 w-3" />}
          {isSpeaking ? "Playing…" : "Listen"}
        </button>
        <button type="button" onClick={() => copy(hook)} className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors">
          <Copy className="h-3 w-3" /> Copy hook
        </button>
      </div>
      {isSpeaking && <p className="mt-1 ml-7 text-[10px] font-mono text-muted-foreground/70">• TTS preview — use Voiceover Studio for a neural voice MP3</p>}
    </div>
  );
}

// ── premium AI brief (generate / upsell) ───────────────────────────
function PremiumBriefCard({ hasBrief, narrativeBrief, connected }: { hasBrief: boolean; narrativeBrief: AutomationEngineProps["narrativeBrief"]; connected: boolean }) {
  const isPro = useIsPro();
  const { openProUpgrade } = useProUpgrade();
  const brief = useAudienceBrief();
  const gen = () => brief.mutate();

  useEffect(() => {
    if (brief.error) {
      const msg = brief.error.message ?? "";
      if (msg.includes("Pro") || msg.includes("PRO_REQUIRED")) {
        toast.error("The Audience Brief is a Pro feature", { description: "Upgrade to unlock AI-generated video ideas." });
        openProUpgrade({ defaultTab: "payment", reason: "automation-brief" });
      } else {
        toast.error(msg || "Brief generation failed");
      }
    }
  }, [brief.error, openProUpgrade]);

  return (
    <Card className="glass-strong border-primary/20 bracket relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 via-transparent to-primary/10" />
      <CardHeader className="relative pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <Sparkles className="h-4 w-4 text-fuchsia-400" /> AI audience brief
        </CardTitle>
        <CardDescription>Deep-dive on who they are & the next 3 videos to make</CardDescription>
      </CardHeader>
      <CardContent className="relative">
        {!connected ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Connect YouTube to unlock the deep audience brief.</p>
        ) : hasBrief && narrativeBrief ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">{narrativeBrief.headline}</p>
            <p className="text-[11px] font-mono text-fuchsia-300/90">{narrativeBrief.who}</p>
            <p className="text-[11px] font-mono text-amber-300/90">RETENTION TRUTH · {narrativeBrief.retention_truth}</p>
            <div className="flex flex-wrap gap-1.5">
              {narrativeBrief.what_they_want.map((w) => <Badge key={w} variant="outline" className="text-[9px] font-mono text-muted-foreground border-border/40">{w}</Badge>)}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isPro
                ? "Generate the full audience brief — head, wants, retention truth and your next 3 video ideas."
                : "Unlock a Pro audience brief that names your audience and your next 3 videos."}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" className="cyber-button gap-2 text-xs font-display" disabled={brief.isPending} onClick={gen}>
                {brief.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 fill-primary-foreground" />}
                {brief.isPending ? "Generating…" : "Generate AI brief"}
              </Button>
              {!isPro && (
                <Button size="sm" variant="outline" className="gap-2 text-xs" onClick={() => openProUpgrade({ defaultTab: "payment", reason: "automation-brief" })}>
                  <Lock className="h-3.5 w-3.5" /> Unlock Pro
                </Button>
              )}
            </div>
            <p className="text-[10px] font-mono text-muted-foreground/70">Pro · 3/day · regenerates on data drift</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── activation checklist ───────────────────────────────────────────
function ActivationChecklist({ connected, signalsReady, competitorsReady }: { connected: boolean; signalsReady: boolean; competitorsReady: boolean }) {
  const steps = [
    { done: connected, label: "Connect your YouTube channel", act: connected ? null : "Connect", to: undefined as string | undefined },
    { done: signalsReady, label: "Fetch your audience signals", act: signalsReady ? null : "Sync", to: undefined },
    { done: competitorsReady, label: "Run a competitor analysis", act: competitorsReady ? null : "Analyze", to: "/clone-crush" },
    { done: false, label: "Generate AI ideas & hooks", act: "Generate", to: undefined },
  ];
  return (
    <Card className="cyber-card border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-base"><Rocket className="h-4 w-4 text-amber-400" /> Activate the automation engine</CardTitle>
        <CardDescription>Three steps to turn this into a hands-off decision machine</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border/40 bg-secondary/20 p-2.5">
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", s.done ? "bg-emerald-500/15 text-emerald-400" : "bg-secondary text-muted-foreground")}>
              {s.done ? <CheckCircle2 className="h-4 w-4" /> : <span className="font-mono text-[11px]">{i + 1}</span>}
            </span>
            <p className={cn("flex-1 text-xs", s.done ? "text-muted-foreground" : "text-foreground")}>{s.label}</p>
            {s.act && (s.to ? (
              <Button asChild size="sm" variant="outline" className="gap-1.5 text-[10px]"><Link to={s.to}><Cpu className="h-3 w-3" /> {s.act}</Link></Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5 text-[10px]" disabled><TrendingUp className="h-3 w-3" /> {s.act}</Button>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── browser TTS speech hook (zero-cost voiceover preview) ──────────
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
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("Voice preview not supported in this browser");
      return;
    }
    window.speechSynthesis.cancel();
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    if (voiceRef.current) u.voice = voiceRef.current;
    u.rate = 1.02;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  };
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}
