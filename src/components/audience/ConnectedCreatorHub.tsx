import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, CheckCircle2, Cable, Database, RefreshCw, ShieldCheck, Sparkles, Terminal, TrendingUp, Wifi, Zap, PenLine, Search } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useYouTubeConnection, useYouTubeHub } from "@/hooks/useEngineData";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

/**
 * Connected Creator Hub — enterprise-performance dashboard for the user's OWN
 * connected YouTube channel. Replaces the bare "connected" empty state with a
 * premium hub: authentic YouTube branding, live API-sync status, a terminal
 * feed of the data pipeline, and real signal visualizations (momentum, velocity,
 * audience pull) computed by the backend Audience Engine.
 */

// Official YouTube mark (authentic branding).
function YouTubeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z" />
    </svg>
  );
}

// Brand neon palette pulled from the app theme.
const MOMENTUM_COLOR = "#22d3ee"; // accent cyan
const VELOCITY_COLOR = "#8b5cf6"; // primary purple
const GEO_COLORS = ["#8b5cf6", "#06b6d4", "#f59e0b", "#f43f5e", "#22c55e", "#3b82f6"];

const momentumConfig = { value: { label: "Momentum", color: MOMENTUM_COLOR } } satisfies ChartConfig;
const velocityConfig = { value: { label: "Velocity", color: VELOCITY_COLOR } } satisfies ChartConfig;
const geoConfig = { value: { label: "Audience pull", color: GEO_COLORS[0] } } satisfies ChartConfig;

type FeedStep = { text: string; done: boolean; live?: boolean };
const FEED_SCRIPT = [
  "Initializing Creator Hub… authenticating engine link",
  "Fetching 30-day audience signals…",
  "Analyzing retention curves…",
  "Computing signal momentum & views velocity…",
  "Hydrating visual engine — dashboard ready",
];

// Quick execution modules — the "do something now" row (bottom of Command Center).
const ACTIONS = [
  { icon: Zap, label: "Clone & Crush AI", desc: "Repurpose a winning video into an original package", to: "/clone-crush", color: "text-purple-400", bar: "from-purple-600/60 to-cyan-500/40" },
  { icon: PenLine, label: "Daily Action Script", desc: "Generate a ready-to-record script from your niche", to: "/create", color: "text-fuchsia-400", bar: "from-fuchsia-600/60 to-violet-500/40" },
  { icon: Search, label: "Competitor Intelligence", desc: "Live competitive tables, velocity and threat alerts", to: "/seo", color: "text-cyan-400", bar: "from-cyan-600/60 to-blue-500/40" },
];

export function ConnectedCreatorHub({
  connection,
  sideSlot,
}: {
  connection: ReturnType<typeof useYouTubeConnection>;
  sideSlot?: ReactNode;
}) {
  const hub = useYouTubeHub(true);
  const channelTitle = connection.data?.channelTitle ?? "My Channel";
  const channelHandle = connection.data?.channelHandle ?? "@my-channel";
  const lastSyncAt = connection.data?.lastSyncAt ?? null;
  const scopesGranted = (connection.data as { scopesGranted?: string[] } | undefined)?.scopesGranted?.length ?? 0;

  const [feedIdx, setFeedIdx] = useState(0);
  const loading = hub.isLoading || hub.isPending;

  // Drive the terminal feed forward as the data pipeline progresses. The feed is
  // tied to the ACTUAL fetch lifecycle (loading -> loaded), so it reflects the
  // real pipeline rather than a fake progress bar.
  useEffect(() => {
    if (!loading && feedIdx < FEED_SCRIPT.length) setFeedIdx(FEED_SCRIPT.length);
  }, [loading, feedIdx]);

  useEffect(() => {
    if (!loading) return;
    const id = window.setInterval(() => {
      setFeedIdx((i) => (i < FEED_SCRIPT.length - 1 ? i + 1 : i));
    }, 700);
    return () => window.clearInterval(id);
  }, [loading]);

  const steps: FeedStep[] = FEED_SCRIPT.map((text, i) => ({
    text,
    done: i < feedIdx,
    live: i === feedIdx && loading,
  }));

  const data = hub.data;
  const momentum = data?.momentum ?? [];
  const velocity = data?.velocity ?? [];
  const geoShare = data?.geoShare ?? [];
  const topHungers = data?.topHungers ?? [];
  const hasSignals = momentum.length > 0;
  const geoTotal = geoShare.reduce((s, g) => s + g.value, 0);

  const created = useMemo(() => {
    const d = lastSyncAt ? new Date(lastSyncAt) : null;
    return d && !Number.isNaN(d.getTime())
      ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "—";
  }, [lastSyncAt]);

  const monogram = (channelTitle || "Y").trim().charAt(0).toUpperCase() || "Y";

  return (
    <div className="space-y-4 md:space-y-5 animate-fade-in">
      {/* ═══ TOP ROW — verified creator banner + live integration telemetry ═══ */}
      <Card className="glass-strong bracket border-primary/20 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-cyan-400/10" />
        <CardContent className="relative flex flex-col gap-4 p-5 md:p-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="relative h-14 w-14 shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/60 to-accent/50 blur-md opacity-70" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-card font-display text-xl font-bold text-foreground shadow-inner">
                {monogram}
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate font-display text-lg font-bold text-foreground sm:text-xl">{channelTitle}</h3>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-display uppercase tracking-wider text-primary border border-primary/30">Verified creator</span>
              </div>
              <p className="text-xs font-mono text-muted-foreground truncate">{channelHandle}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 animate-pulse-glow">
                  <Wifi className="h-3 w-3" /> Active API Sync
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                  <Activity className="h-3 w-3" /> last sync {created}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 lg:flex-col lg:items-end lg:text-right">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10">
              <YouTubeMark className="h-6 w-6 text-red-500" />
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              <p className="flex items-center gap-1 justify-center lg:justify-end"><ShieldCheck className="h-3 w-3 text-emerald-500" /> {scopesGranted} read-only scopes</p>
              <p className="text-cyan-400/80">OFFICIAL YOUTUBE INTEGRATION</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ MIDDLE GRID — live visualizations (left) | streak + conveyor (right) ═══ */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: analytics column */}
        <div className="space-y-4 lg:col-span-2">
          {/* Terminal feed: the data pipeline */}
          <Card className="cyber-card border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <Terminal className="h-4 w-4 text-cyan-400" /> DATA ENGINE
              </CardTitle>
              <CardDescription>Live pipeline feed — how your channel's signals are processed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-border/60 bg-background/70 p-3 font-mono text-[11px] leading-relaxed">
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 transition-opacity duration-300 ${s.done || s.live ? "opacity-100" : "opacity-25"}`}
                  >
                    <span className="text-cyan-400/70">❯</span>
                    <span className={s.live ? "text-cyan-300" : s.done ? "text-emerald-400" : "text-muted-foreground"}>
                      {s.text}
                    </span>
                    {s.done && <CheckCircle2 className="ml-auto h-3 w-3 text-emerald-500" />}
                    {s.live && <span className="ml-auto inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400" />}
                  </div>
                ))}
                {!loading && <div className="mt-1 flex items-center gap-2 text-emerald-400">❯ pipeline complete</div>}
              </div>
            </CardContent>
          </Card>

          {/* Signal visualizations */}
          {hasSignals ? (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Signal momentum (area) */}
              <Card className="cyber-card border-border/70">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-display text-base">
                    <TrendingUp className="h-4 w-4 text-cyan-400" /> Signal Momentum
                  </CardTitle>
                  <CardDescription>Audience-engine momentum score per signal</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={momentumConfig} className="h-[220px] w-full">
                    <AreaChart data={momentum} margin={{ left: 4, right: 12 }}>
                      <defs>
                        <linearGradient id="momentumGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={MOMENTUM_COLOR} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={MOMENTUM_COLOR} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.15} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={28} />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <Area type="monotone" dataKey="value" stroke={MOMENTUM_COLOR} strokeWidth={2} fill="url(#momentumGrad)" />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Views velocity (bar) */}
              <Card className="cyber-card border-border/70">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-display text-base">
                    <Activity className="h-4 w-4 text-primary" /> Views Velocity
                  </CardTitle>
                  <CardDescription>Engagement velocity per signal (hook retention / score)</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={velocityConfig} className="h-[220px] w-full">
                    <BarChart data={velocity} margin={{ left: 4, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.15} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={28} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={22}>
                        {velocity.map((_, i) => <Cell key={i} fill={VELOCITY_COLOR} />)}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Audience pull (donut) */}
              <Card className="cyber-card border-border/70">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-display text-base">
                    <Cable className="h-4 w-4 text-amber-400" /> Audience Pull
                  </CardTitle>
                  <CardDescription>Where your audience signals originate</CardDescription>
                </CardHeader>
                <CardContent>
                  {geoTotal > 0 ? (
                    <div className="flex flex-col items-center gap-3 sm:flex-row">
                      <ChartContainer config={geoConfig} className="h-[190px] w-full max-w-[240px] mx-auto">
                        <PieChart accessibilityLayer>
                          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                          <Pie data={geoShare} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                            {geoShare.map((entry, i) => <Cell key={entry.name} fill={GEO_COLORS[i % GEO_COLORS.length]} />)}
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                      <div className="w-full space-y-1.5">
                        {geoShare.map((entry, i) => (
                          <div key={entry.name} className="flex items-center gap-2 text-xs">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: GEO_COLORS[i % GEO_COLORS.length] }} />
                            <span className="truncate text-muted-foreground">{entry.name}</span>
                            <span className="ml-auto font-mono text-foreground">{Math.round((entry.value / geoTotal) * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="py-10 text-center text-xs text-muted-foreground">No geo signals yet.</p>
                  )}
                </CardContent>
              </Card>

              {/* Top signals ranked */}
              <Card className="cyber-card border-border/70">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 font-display text-base">
                    <Sparkles className="h-4 w-4 text-fuchsia-400" /> Top Signals
                  </CardTitle>
                  <CardDescription>Highest-ranked audience signals for your channel</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {topHungers.slice(0, 5).map((h) => (
                      <div key={h.topic} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">{h.topic}</p>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
                            <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700" style={{ width: `${h.score}%` }} />
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-cyan-300">{h.score}</span>
                      </div>
                    ))}
                    {topHungers.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No signals computed yet.</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="cyber-card border-border/70">
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                <Database className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-mono text-muted-foreground">Signals are being computed by the Audience Engine…</p>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => void hub.refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: streak + content conveyor slots */}
        <div className="space-y-4">{sideSlot}</div>
      </div>

      {/* ═══ BOTTOM ROW — quick execution modules ═══ */}
      <div className="grid gap-3 md:grid-cols-3">
        {ACTIONS.map((a) => (
          <Link key={a.label} to={a.to} className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/80 backdrop-blur-md transition-all duration-300 hover:border-primary/50 hover:shadow-xl active:scale-[0.99]">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${a.bar}`} />
            <div className="relative p-4 flex items-center gap-3">
              <div className={`h-11 w-11 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center ${a.color}`}>
                <a.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-display font-semibold text-foreground">{a.label}</p>
                <p className="text-xs text-muted-foreground leading-snug">{a.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
