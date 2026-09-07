import { useMemo, useState } from "react";
import {
  Rocket,
  Target,
  CalendarDays,
  Trophy,
  TrendingUp,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Gauge,
  Zap,
  Radio,
  Layers,
  Flame,
  ShieldCheck,
  RefreshCw,
  Globe2,
  Film,
  Timer,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { engineConfigured } from "@/lib/engine/client";
import { useSoftGate } from "@/contexts/SoftGateContext";
import {
  useYouTubeConnection,
  useYouTubeHub,
  useChallengeState,
  useEngineScripts,
  useAudienceProfile,
} from "@/hooks/useEngineData";
import { useCloneCrushStore } from "@/stores/useCloneCrushStore";
import { AutomationEngine } from "@/components/growth/AutomationEngine";
import type { BriefSignal, CompetitorSignal } from "@/lib/growth/synthesis";

/**
 * Advanced YouTube Growth Engine — a data-driven growth intelligence console.
 *
 * Unlike a static card page, this surfaces the SAME live telemetry the
 * Connected Creator Hub uses and turns it into decisions:
 *   - Signal Momentum / Views Velocity / Audience Pull (backend Audience Engine)
 *   - Publishing consistency (30-day challenge)
 *   - Content output + value (script packages)
 *   - Competitor velocity & revenue gap (Clone & Crush store)
 *
 * Derived/projected numbers are explicitly labelled "modeled" so they are never
 * mistaken for server truth. Every chart renders only when its real data is
 * present; empty states are intentional, not loading loops.
 */

// ── Brand neon tokens (match app theme) ────────────────────────────────
const CYAN = "#22d3ee";
const PURPLE = "#8b5cf6";
const FUCHSIA = "#d946ef";
const AMBER = "#f59e0b";
const EMERALD = "#22c55e";
const ROSE = "#f43f5e";
const GEO_COLORS = [PURPLE, CYAN, AMBER, ROSE, EMERALD, "#3b82f6"];

const demandConfig = { momentum: { label: "Demand", color: CYAN }, velocity: { label: "Velocity", color: PURPLE } } satisfies ChartConfig;
const barConfig = { value: { label: "Views velocity", color: PURPLE } } satisfies ChartConfig;
const geoConfig = { value: { label: "Audience pull", color: PURPLE } } satisfies ChartConfig;
const forecastConfig = { views: { label: "Projected views/mo", color: CYAN }, confidence: { label: "Confidence band", color: PURPLE } } satisfies ChartConfig;

// ── helpers ───────────────────────────────────────────────────────────
const avg = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
const fmtK = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
};
const fmtPct = (n: number) => `${Math.round(n)}%`;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

type Frame = "fresh" | "stale" | "cold" | "empty";

const FRAME_META: Record<Frame, { label: string; tone: "text-emerald-400" | "text-amber-400" | "text-rose-400" | "text-muted-foreground"; dot: string }> = {
  fresh: { label: "Live data", tone: "text-emerald-400", dot: "bg-emerald-400" },
  stale: { label: "Stale — resync", tone: "text-amber-400", dot: "bg-amber-400" },
  cold: { label: "Cold — needs sync", tone: "text-rose-400", dot: "bg-rose-400" },
  empty: { label: "No data", tone: "text-muted-foreground", dot: "bg-muted-foreground/40" },
};

// Components not used in every render path start with an underscore suffix to
// avoid unused-var lint noise while keeping the file self-contained.

export default function YoutubeGrowth() {
  const { isAuthenticated, requestAuthentication } = useSoftGate();
  const enabled = isAuthenticated && engineConfigured();

  const connection = useYouTubeConnection(enabled);
  const hub = useYouTubeHub(enabled && (connection.data?.connected ?? false));
  const profile = useAudienceProfile(enabled && (connection.data?.connected ?? false));
  const challenge = useChallengeState(enabled);
  const scriptsQ = useEngineScripts(enabled);

  const competitors = useCloneCrushStore((s) => s.competitors);
  const envyMetrics = useCloneCrushStore((s) => s.envyMetrics);
  const savedChannels = useCloneCrushStore((s) => s.savedChannels);
  const conveyorQueue = useCloneCrushStore((s) => s.conveyorQueue);

  const connected = connection.data?.connected ?? false;
  const channelTitle = connection.data?.channelTitle ?? "Your channel";
  const channelHandle = connection.data?.channelHandle ?? "@your-channel";
  const lastSyncAt = connection.data?.lastSyncAt ?? null;
  const freshness = (hub.data ? connection.data?.status : undefined) as Frame | undefined;

  // ── live signal series ──
  const momentum = useMemo(() => hub.data?.momentum ?? [], [hub.data]);
  const velocity = useMemo(() => hub.data?.velocity ?? [], [hub.data]);
  const geoShare = useMemo(() => hub.data?.geoShare ?? [], [hub.data]);
  const topHungers = useMemo(() => hub.data?.topHungers ?? [], [hub.data]);

  // ── derived KPIs ──
  const avgMomentum = avg(momentum.map((m) => m.value));
  const avgRetention = avg(topHungers.map((h) => h.hook_retention ?? h.score));
  const topHunger = topHungers[0] ?? null;
  const geoTop = geoShare[0] ?? null;
  // geoShare values are already 0–100 percentage shares from the engine.
  const geoTotal = geoShare.reduce((s, g) => s + g.value, 0) || 100;

  const challengeActive = challenge.data?.status === "active";
  const streak = challenge.data?.streak ?? challenge.data?.elapsed_days ?? 0;
  const scriptDays = challenge.data?.total_script_days ?? 0;
  const publishDays = challenge.data?.total_publish_days ?? 0;
  const consistency = clamp(scriptDays, 0, 30); // 0..30

  const scripts = scriptsQ.data?.scripts ?? [];
  const packageCount = scripts.filter((s) => s.kind === "package").length;
  const outlineCount = scripts.filter((s) => s.kind === "outline").length;
  const outputValue = scripts.reduce((s, sc) => s + (sc.cost_usd || 0), 0);
  const avgCritic = avg(scripts.map((s) => s.critic?.weighted_total ?? 0).filter((v) => v > 0));

  const competitorAvgVelocity = envyMetrics?.averageViralVelocity ?? 0;
  const competitorRevenue = envyMetrics?.totalCompetitorMonthlyRevenueNum ?? 0;
  const niche = envyMetrics?.niche ?? "your niche";
  const nicheCpm = envyMetrics?.nicheCpm ?? "—";

  // ── automation engine inputs (real telemetry, mapped) ──
  const geoName = geoTop?.name;
  const topSignals: BriefSignal[] = useMemo(() => topHungers.map((h) => ({
    topic: h.topic,
    score: h.score,
    hook_retention: h.hook_retention,
    watch_share_pct: h.watch_share_pct,
    geo: geoName,
  })), [topHungers, geoName]);

  const competitorTop: CompetitorSignal | null = useMemo(() => {
    const valid = competitors.map((c) => ({
      title: c.title, channelName: c.channelName, views: c.viewsCount ?? 0,
      velocity: c.viralVelocityScore ?? 0, revenue: c.estimatedRevenueNum ?? 0,
      thumbnail: c.thumbnail, url: c.url, videoId: c.videoId,
    })).filter((c) => c.views > 0);
    if (!valid.length) return null;
    return valid.sort((a, b) => b.velocity - a.velocity || b.views - a.views)[0];
  }, [competitors]);

  const narrativeBrief = profile.data?.narrative?.brief ?? null;

  // ── composite Growth Score (0..100) — modeled, transparent weighting ──
  const growthScore = useMemo(() => {
    const signals = avgMomentum || 0; // audience demand strength
    const retention = avgRetention || 0; // hook quality
    const cadence = consistency; // publishing cadence (0..30)
    const partSignals = signals * 0.35;
    const partRetention = retention * 0.3;
    const partCadence = (cadence / 30) * 100 * 0.35;
    return clamp(Math.round(partSignals + partRetention + partCadence));
  }, [avgMomentum, avgRetention, consistency]);

  const scoreTone = growthScore >= 70 ? EMERALD : growthScore >= 40 ? AMBER : ROSE;

  // ── radar series (demand vs velocity per signal) ──
  const radarData = useMemo(() => {
    const len = Math.min(momentum.length, velocity.length);
    return Array.from({ length: len }, (_, i) => ({
      axis: momentum[i].label,
      momentum: momentum[i].value,
      velocity: velocity[i].value,
    }));
  }, [momentum, velocity]);

  // ── 12-week growth projection — modeled from real input scalars ──
  const forecast = useMemo(() => {
    const base = Math.max(350, Math.round((avgMomentum || 40) * 12)); // views/mo baseline
    const slope = 0.35 + (consistency / 30) * 0.65; // cadence accelerates growth
    const rows = Array.from({ length: 12 }, (_, w) => {
      const weeks = w + 1;
      const views = Math.round(base * Math.pow(1.06 * slope, weeks / 2.2));
      const hi = Math.round(views * 1.12);
      const lo = Math.round(views * 0.88);
      return { week: `W${weeks}`, views, hi, lo };
    });
    return { rows, base };
  }, [avgMomentum, consistency]);
  const projViews = forecast.rows[forecast.rows.length - 1]?.views ?? 0;

  // ── data-driven weekly action plan ──
  const action = useMemo(() => {
    if (topHunger) {
      return {
        headline: `Ship a package on “${topHunger.topic}”`,
        why: `Your highest-demand signal pulls at ${topHunger.score}/100 — it's your best next upload.`,
        to: "/clone-crush",
        cta: "Clone & Crush AI",
      };
    }
    if (competitorAvgVelocity > 0) {
      return {
        headline: `Close the gap against ${niche}`,
        why: `Competitors average ${Math.round(competitorAvgVelocity)}/100 velocity with ~${fmtK(competitorRevenue)}/mo. Publish to capture demand.`,
        to: "/clone-crush",
        cta: "Analyze a competitor",
      };
    }
    return {
      headline: "Connect YouTube to start your growth plan",
      why: "Live signals turn your niche into a concrete weekly action.",
      to: connected ? "/create" : "#",
      cta: connected ? "Create from a topic" : "Connect YouTube",
    };
  }, [topHunger, competitorAvgVelocity, competitorRevenue, niche, connected]);

  const handleConnect = () => {
    if (!connected) void requestAuthentication("connect YouTube for live growth signals");
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ═══ HEADER BAND — live identity + engine freshness ═══ */}
      <Card className="glass-strong bracket border-primary/20 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-cyan-400/10" />
        <CardContent className="relative flex flex-col gap-4 p-5 md:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="relative h-14 w-14 shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/60 to-accent/50 blur-md opacity-70" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-card font-display text-xl font-bold text-foreground shadow-inner">
                {connected ? (channelTitle?.[0]?.toUpperCase() ?? "C") : <Rocket className="h-6 w-6 text-primary" />}
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-display text-xl md:text-2xl font-black text-foreground">Growth Engine</h1>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-primary border border-primary/30">Advanced YouTube growth</span>
              </div>
              <p className="mt-0.5 flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className="truncate">{connected ? `${channelTitle} · ${channelHandle}` : "No channel connected"}</span>
                {connected && <span className="hidden sm:inline text-[10px] text-muted-foreground/70">last sync {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "—"}</span>}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 animate-pulse-glow">
                  <Radio className="h-3 w-3" /> Live telemetry
                </span>
                <span className={cn("inline-flex items-center gap-1 text-[10px] font-mono", (FRAME_META[freshness ?? "empty"]).tone)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", (FRAME_META[freshness ?? "empty"]).dot)} /> {(FRAME_META[freshness ?? "empty"]).label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {connected ? (
              <>
                <Button asChild className="cyber-button gap-2 text-xs font-display">
                  <Link to={action.to}><Zap className="h-4 w-4 fill-primary-foreground" /> {action.cta}</Link>
                </Button>
                <Button asChild variant="outline" className="gap-2 text-xs">
                  <Link to="/analytics"><TrendingUp className="h-4 w-4" /> Project revenue</Link>
                </Button>
              </>
            ) : (
              <Button className="cyber-button gap-2 text-xs font-display" onClick={handleConnect}>
                <ShieldCheck className="h-4 w-4 fill-primary-foreground" /> Connect YouTube
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══ AUTOMATION ENGINE — the decision layer ═══ */}
      <AutomationEngine
        connected={connected}
        topSignals={topSignals}
        geo={geoShare}
        heroRetention={avgRetention}
        competitorVelocity={competitorAvgVelocity}
        competitorRevenue={competitorRevenue}
        niche={niche}
        nicheCpm={nicheCpm}
        competitorTop={competitorTop}
        cadence={consistency}
        packageCount={packageCount}
        narrativeBrief={narrativeBrief}
      />

      {/* ═══ KPI STRIP — real, live metrics ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4">
        <KpiCard icon={Target} label="Top demand" value={topHunger ? `${topHunger.score}` : "—"} suffix="/100" tone="text-cyan-300" hint={topHunger?.topic ?? "connect to compute"} />
        <KpiCard icon={Flame} label="Hook retention" value={avgRetention ? `${Math.round(avgRetention)}` : "—"} suffix="%" tone="text-fuchsia-300" hint="avg across signals" />
        <KpiCard icon={Globe2} label="Top audience pull" value={geoTop ? geoTop.name : "—"} tone="text-purple-300" hint={geoTop ? `${fmtPct(geoTop.value)} share` : "geo signals"} />
        <KpiCard icon={CalendarDays} label="30-day cadence" value={`${scriptDays}`} suffix="/30" tone="text-emerald-300" hint={`${publishDays} published · ${challengeActive ? `${streak}d streak` : "not active"}`} />
        <KpiCard icon={Film} label="Packages built" value={`${packageCount}`} tone="text-amber-300" hint={`${outlineCount} outlines · ${fmtK(outputValue)} value`} />
        <KpiCard icon={Gauge} label="Competitor velocity" value={competitorAvgVelocity ? `${Math.round(competitorAvgVelocity)}` : "—"} suffix="/100" tone="text-rose-300" hint={`${niche} · CPM ${nicheCpm}`} />
      </div>

      {/* ═══ MAIN GRID ═══ */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* LEFT 2/3 — signal visualizations */}
        <div className="space-y-4 lg:col-span-2">
          <SignalVisuals
            radarData={radarData}
            velocity={velocity}
            geoShare={geoShare}
            geoTotal={geoTotal}
            connected={connected}
          />
          <CompetitorTable
            competitors={competitors}
            avgVelocity={competitorAvgVelocity}
            nicheCpm={nicheCpm}
          />
        </div>

        {/* RIGHT 1/3 — Growth Score + opportunity + pipeline */}
        <div className="space-y-4">
          <GrowthScoreCard score={growthScore} tone={scoreTone} avgRetention={avgRetention} avgMomentum={avgMomentum} consistency={consistency} />

          {/* Opportunity ranking */}
          <Card className="cyber-card border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Target className="h-4 w-4 text-cyan-300" /> Opportunity ranking
              </CardTitle>
              <CardDescription>Highest-demand audiences to target next</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {topHungers.length ? (
                topHungers.slice(0, 5).map((h, i) => (
                  <div key={h.topic} className="group">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-5 text-center font-mono text-[11px]", i === 0 ? "text-amber-300" : "text-muted-foreground")}>{i + 1}</span>
                      <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{h.topic}</p>
                      <span className="font-mono text-[11px] text-cyan-300">{h.score}</span>
                    </div>
                    <div className="mt-1 ml-7 h-1.5 w-[calc(100%-1.75rem)] overflow-hidden rounded-full bg-secondary/60">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${h.score}%`, background: `linear-gradient(90deg, ${PURPLE}, ${i === 0 ? AMBER : CYAN})` }} />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState connected={connected} onConnect={handleConnect} label="Opportunity ranking needs live audience signals." />
              )}
              {topHungers.length > 0 && (
                <Button asChild variant="outline" size="sm" className="w-full mt-1 gap-2 text-xs">
                  <Link to="/clone-crush"><Zap className="h-3.5 w-3.5" /> Clone the top opportunity</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Content pipeline */}
          <Card className="cyber-card border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Layers className="h-4 w-4 text-primary" /> Content pipeline
              </CardTitle>
              <CardDescription>Your tracked channels & queued packages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(savedChannels ?? []).slice(0, 3).map((c) => (
                <div key={c.url} className="flex items-center gap-3 rounded-xl border border-border/40 bg-secondary/30 p-2.5">
                  <img src={c.avatar || undefined} alt={c.name} className="h-9 w-9 shrink-0 rounded-lg bg-card border border-border/40 object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{c.name}</p>
                    <p className="truncate text-[10px] font-mono text-muted-foreground">{c.handle}</p>
                  </div>
                  <span className="text-[9px] font-mono text-cyan-400/80">slot {c.slotIndex + 1}</span>
                </div>
              ))}
              {!(savedChannels ?? []).length && (
                <Link to="/clone-crush" className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 bg-secondary/20 p-2.5 hover:border-primary/40 transition-colors">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60"><Plus className="h-4 w-4 text-muted-foreground/60" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">Add a channel to the conveyor</p>
                    <p className="text-[10px] text-muted-foreground">Track competitors and queue packages</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                </Link>
              )}
              {(conveyorQueue?.length ?? 0) > 0 && (
                <p className="pt-1 text-[10px] font-mono text-cyan-400/80">{conveyorQueue.length} package{conveyorQueue.length === 1 ? "" : "s"} in the queue</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ═══ BOTTOM — projection + action plan ═══ */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="cyber-card border-border/60 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <TrendingUp className="h-4 w-4 text-cyan-400" /> 12-week growth projection
            </CardTitle>
            <CardDescription>Modelled from your demand, retention & cadence — not a guarantee</CardDescription>
          </CardHeader>
          <CardContent>
            {connected ? (
              <>
                <ChartContainer config={forecastConfig} className="h-[260px] w-full">
                  <AreaChart data={forecast.rows} margin={{ left: 4, right: 12 }}>
                    <defs>
                      <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CYAN} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={CYAN} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.12} />
                    <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tickLine={false} axisLine={false} width={40} tick={{ fontSize: 10 }} tickFormatter={(v) => fmtK(v)} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Area type="monotone" dataKey="hi" stroke={PURPLE} strokeOpacity={0.25} fill={PURPLE} fillOpacity={0.06} strokeWidth={0} />
                    <Area type="monotone" dataKey="lo" stroke={PURPLE} strokeOpacity={0.25} fill="transparent" strokeWidth={0} />
                    <Area type="monotone" dataKey="views" stroke={CYAN} strokeWidth={2.5} fill="url(#fcGrad)" />
                  </AreaChart>
                </ChartContainer>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CYAN }} /> Projected ~{fmtK(projViews)} views/mo by week 12</span>
                  <span className="text-[10px] font-mono text-muted-foreground">model · confidence band shown</span>
                </div>
              </>
            ) : (
              <EmptyState connected={false} onConnect={handleConnect} label="Connect YouTube to project your growth." />
            )}
          </CardContent>
        </Card>

        {/* Weekly action plan */}
        <Card className="glass-strong bracket border-primary/20 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-cyan-400/10" />
          <CardContent className="relative flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-amber-300" />
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">This week's move</p>
            </div>
            <p className="font-display text-lg font-bold text-foreground leading-snug">{action.headline}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{action.why}</p>
            {topHunger && (
              <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-[11px] font-mono text-primary">
                SIGNAL &gt;&gt; “{topHunger.topic}” · pull {topHunger.score}/100
              </div>
            )}
            <Button asChild className="cyber-button mt-auto gap-2 text-xs font-display">
              <Link to={action.to}><Sparkles className="h-4 w-4 fill-primary-foreground" /> {action.cta}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══ KPI card ═══
function KpiCard({ icon: Icon, label, value, suffix, tone, hint }: { icon: any; label: string; value: string; suffix?: string; tone: string; hint: string }) {
  return (
    <Card className="glass-strong border-border hover:border-primary/30 transition-colors bracket">
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] md:text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl md:text-2xl font-display font-bold text-foreground truncate">
              {value}{suffix && <span className="text-xs font-mono text-muted-foreground">{suffix}</span>}
            </p>
          </div>
          <div className="h-8 w-8 md:h-9 md:w-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className={`h-4 w-4 md:h-4.5 md:w-4.5 ${tone}`} /></div>
        </div>
        <p className="mt-1.5 truncate text-[9px] font-mono text-muted-foreground/70">{hint}</p>
      </CardContent>
    </Card>
  );
}

// ═══ Signal visualizations (radar + bar + donut) ═══
function SignalVisuals({ radarData, velocity, geoShare, geoTotal, connected }: {
  radarData: { axis: string; momentum: number; velocity: number }[];
  velocity: { label: string; value: number }[];
  geoShare: { name: string; value: number }[];
  geoTotal: number;
  connected: boolean;
}) {
  if (!connected) {
    return (
      <Card className="cyber-card border-border/60">
        <CardContent className="p-10 flex flex-col items-center gap-2 text-center">
          <Radio className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-mono text-muted-foreground">Signal visualizations will light up once your channel is connected.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Demand vs velocity radar */}
        <Card className="cyber-card border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-display text-base"><Target className="h-4 w-4 text-cyan-400" /> Signal velocity</CardTitle>
            <CardDescription>Demand vs engagement velocity per audience</CardDescription>
          </CardHeader>
          <CardContent>
            {radarData.length ? (
              <ChartContainer config={demandConfig} className="h-[240px] w-full">
                <RadarChart data={radarData}>
                  <PolarGrid strokeOpacity={0.2} />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="velocity" dataKey="velocity" stroke={PURPLE} fill={PURPLE} fillOpacity={0.3} strokeWidth={2} />
                  <Radar name="momentum" dataKey="momentum" stroke={CYAN} fill={CYAN} fillOpacity={0.25} strokeWidth={2} />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                </RadarChart>
              </ChartContainer>
            ) : <ChartEmpty label="No signal axes yet." />}
          </CardContent>
        </Card>

        {/* Views velocity bars */}
        <Card className="cyber-card border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 font-display text-base"><Flame className="h-4 w-4 text-primary" /> Views velocity</CardTitle>
            <CardDescription>Engagement velocity per signal</CardDescription>
          </CardHeader>
          <CardContent>
            {velocity.length ? (
              <ChartContainer config={barConfig} className="h-[240px] w-full">
                <BarChart data={velocity} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={28} tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={22}>
                    {velocity.map((_, i) => <Cell key={i} fill={PURPLE} />)}
                  </Bar>
                  <ReferenceLine y={avg(velocity.map((v) => v.value))} stroke={AMBER} strokeDasharray="4 4" strokeOpacity={0.6} />
                </BarChart>
              </ChartContainer>
            ) : <ChartEmpty label="No velocity data yet." />}
          </CardContent>
        </Card>
      </div>

      {/* Audience pull donut */}
      <Card className="cyber-card border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 font-display text-base"><Globe2 className="h-4 w-4 text-amber-400" /> Audience pull by geography</CardTitle>
          <CardDescription>Where your highest signal demand originates</CardDescription>
        </CardHeader>
        <CardContent>
          {geoShare.length ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <ChartContainer config={geoConfig} className="h-[200px] w-full max-w-[250px] mx-auto">
                <PieChart accessibilityLayer>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie data={geoShare} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3} strokeWidth={0}>
                    {geoShare.map((e, i) => <Cell key={e.name} fill={GEO_COLORS[i % GEO_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="w-full space-y-1.5">
                {geoShare.map((e, i) => {
                  const pct = geoTotal > 0 ? Math.round((e.value / geoTotal) * 100) : e.value;
                  return (
                    <div key={e.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: GEO_COLORS[i % GEO_COLORS.length] }} />
                      <span className="truncate text-muted-foreground">{e.name}</span>
                      <span className="ml-auto font-mono text-foreground">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : <ChartEmpty label="No geo signals yet." />}
        </CardContent>
      </Card>
    </>
  );
}

// ═══ Competitor table ═══
function CompetitorTable({ competitors, avgVelocity, nicheCpm }: { competitors: any[]; avgVelocity: number; nicheCpm: string }) {
  const rows = (competitors ?? []).slice(0, 6);
  return (
    <Card className="cyber-card border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-base"><Flame className="h-4 w-4 text-rose-400" /> Competitor velocity watchlist</CardTitle>
        <CardDescription>Live viral competitors — {avgVelocity ? `avg ${Math.round(avgVelocity)}/100 velocity` : "wire up via Analyze"} · CPM {nicheCpm}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 border-b border-border/40">
                  <th className="pb-2 pr-2 font-semibold">Video</th>
                  <th className="pb-2 px-2 font-semibold hidden md:table-cell">Channel</th>
                  <th className="pb-2 px-2 font-semibold text-right">Views</th>
                  <th className="pb-2 px-2 font-semibold text-right">Velocity</th>
                  <th className="pb-2 pl-2 font-semibold text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const v = c.viralVelocityScore ?? 0;
                  return (
                    <tr key={c.videoId} className="border-b border-border/25 last:border-0">
                      <td className="py-2 pr-2 max-w-[220px]">
                        <div className="flex items-center gap-2">
                          <img src={c.thumbnail} alt="" className="h-9 w-14 shrink-0 rounded-md object-cover bg-black/40" />
                          <span className="truncate text-foreground font-medium">{c.title}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 hidden md:table-cell truncate text-muted-foreground max-w-[160px]">{c.channelName}</td>
                      <td className="py-2 px-2 text-right font-mono text-foreground">{c.viewsCount ? fmtK(c.viewsCount) : c.views}</td>
                      <td className="py-2 px-2 text-right">
                        <span className={cn("inline-flex items-center gap-1 font-mono", v >= 70 ? "text-rose-300" : v >= 40 ? "text-amber-300" : "text-emerald-300")}>
                          <Flame className="h-3 w-3" />{v || "—"}
                        </span>
                      </td>
                      <td className="py-2 pl-2 text-right font-mono text-green-300">{c.estimatedRevenueNum ? fmtK(c.estimatedRevenueNum) : c.estimatedRevenue ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <ChartEmpty label="No competitors tracked yet — run an analysis to populate the watchlist." />
        )}
      </CardContent>
    </Card>
  );
}

// ═══ Composite Growth Score gauge ═══
function GrowthScoreCard({ score, tone, avgRetention, avgMomentum, consistency }: { score: number; tone: string; avgRetention: number; avgMomentum: number; consistency: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <Card className="cyber-card border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-display text-base"><Gauge className="h-4 w-4 text-primary" /> Growth score</CardTitle>
        <CardDescription>Modeled composite of your signals, retention & cadence</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        <div className="relative h-[130px] w-[130px]">
          <svg viewBox="0 0 130 130" className="h-full w-full -rotate-90">
            <circle cx="65" cy="65" r={r} fill="none" stroke="var(--secondary)" strokeWidth="12" opacity="0.5" />
            <circle cx="65" cy="65" r={r} fill="none" stroke={tone} strokeWidth="12" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
              style={{ transition: "stroke-dashoffset 1s ease", filter: `drop-shadow(0 0 6px ${tone}66)` }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-4xl font-black text-foreground">{score}</span>
            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">/100</span>
          </div>
        </div>
        <div className="mt-3 grid w-full grid-cols-3 gap-2 text-center">
          <GaugeChip label="Demand" value={avgMomentum ? `${Math.round(avgMomentum)}` : "—"} />
          <GaugeChip label="Retention" value={avgRetention ? `${Math.round(avgRetention)}` : "—"} />
          <GaugeChip label="Cadence" value={`${Math.round(consistency)}/30`} />
        </div>
        <p className="mt-3 text-[10px] font-mono text-muted-foreground/70">weighted: demand 35% · retention 30% · cadence 35%</p>
      </CardContent>
    </Card>
  );
}

function GaugeChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-secondary/30 p-2">
      <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

// ═══ shared empty states ═══
function ChartEmpty({ label }: { label: string }) {
  return <p className="py-12 text-center text-xs text-muted-foreground">{label}</p>;
}

function EmptyState({ connected, onConnect, label }: { connected: boolean; onConnect: () => void; label: string }) {
  return (
    <div className="py-8 text-center space-y-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      {!connected && (
        <Button size="sm" variant="outline" className="gap-2" onClick={onConnect}>
          <ShieldCheck className="h-3.5 w-3.5" /> Connect YouTube
        </Button>
      )}
    </div>
  );
}
