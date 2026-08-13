/**
 * src/components/ghost/GhostSquadDossier.tsx
 *
 * INTEL DOSSIER panel — mounted on CloneCrush below the velocity matrix.
 * Runs the Ghost Intel Squad (4-agent) against the currently selected
 * competitor video. Free users are routed to /rewards; Pro users see
 * four collapsible agent sections plus a red THREAT LEVEL bar.
 */
import { useEffect, useState } from "react";
import {
  Shield, Radio, Loader2, Lock, Zap, AlertTriangle, ChevronDown, Target,
  Eye, GitBranch, Swords, TrendingUp, CheckCircle2, Terminal, Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSquadStore, type SquadBrief } from "@/stores/useSquadStore";
import { useIsPro } from "@/stores/useAuthStore";
import { useGhostCredits } from "@/hooks/useGhostCredits";
import { fetchEdgeFunctionJson } from "@/api/client/secureClient";
import { GhostCreditBadge } from "./GhostCreditBadge";

interface SquadVideoTarget {
  videoId: string;
  title: string;
  url: string;
  channelName: string;
  views: string;
  viewsCount: number;
  viralVelocityScore?: number;
  estimatedRevenue?: string;
  publishedAt?: string;
  thumbnail?: string;
}

interface Props {
  video: SquadVideoTarget | null;
  savedNiche: string;
  onUpgrade?: () => void;
  slotId?: number;
}

type AgentKey = "scout" | "crawler" | "analyst" | "comparator";

function threatColor(level: number): { bar: string; text: string; label: string } {
  if (level >= 75) return { bar: "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]", text: "text-red-400", label: "CRITICAL" };
  if (level >= 55) return { bar: "bg-orange-500", text: "text-orange-400", label: "ELEVATED" };
  if (level >= 30) return { bar: "bg-yellow-500", text: "text-yellow-400", label: "MODERATE" };
  return { bar: "bg-emerald-500", text: "text-emerald-400", label: "LOW" };
}

function AgentSection({
  id, icon: Icon, title, subtitle, defaultOpen = false, children,
}: {
  id: AgentKey;
  icon: typeof Shield;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-secondary/40 transition-colors"
        aria-expanded={open}
        aria-controls={`squad-agent-${id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-fuchsia-400 shrink-0" />
          <span className="font-mono text-[11px] font-bold tracking-widest uppercase text-foreground">// {title}</span>
          {subtitle && <span className="text-[9px] text-muted-foreground font-mono truncate hidden sm:inline">· {subtitle}</span>}
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={`squad-agent-${id}`} className="px-3 pb-3 pt-1 text-xs leading-relaxed space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

function BulletList({ items, tone = "default" }: { items?: string[]; tone?: "default" | "good" | "bad" | "warn" }) {
  if (!items || items.length === 0) return <p className="text-muted-foreground text-[11px]">// no intel</p>;
  const color = tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : tone === "warn" ? "text-amber-400" : "text-foreground/80";
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li key={i} className={cn("flex gap-2", color)}>
          <span className="text-muted-foreground shrink-0">›</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function GhostSquadDossier({ video, savedNiche, onUpgrade, slotId = 0 }: Props) {
  const isPro = useIsPro();
  const { credits, refresh: refreshCredits } = useGhostCredits();
  const briefs = useSquadStore((s) => s.briefs);
  const loadingId = useSquadStore((s) => s.loadingVideoId);
  const error = useSquadStore((s) => s.error);
  const setBrief = useSquadStore((s) => s.setBrief);
  const setLoading = useSquadStore((s) => s.setLoading);
  const setError = useSquadStore((s) => s.setError);

  const brief: SquadBrief | null = video ? (briefs[video.videoId] ?? null) : null;
  const isLoading = loadingId !== null && (!video || loadingId === video.videoId);

  useEffect(() => { setError(null); }, [video?.videoId, setError]);

  async function runSquad() {
    if (!video) return;
    if (!isPro) {
      toast.error("Intel Squad is a Pro feature — rerouting", { id: "squad-paywall" });
      onUpgrade?.();
      return;
    }
    if (brief && brief.scout) {
      toast("Dossier already cached for this video", { id: "squad-cached" });
      return;
    }
    setLoading(video.videoId);
    try {
      const res = await fetchEdgeFunctionJson<{ success: boolean; brief?: SquadBrief; error?: string; code?: string }>(
        "ghost/squad-brief",
        { video, savedNiche, slotId },
      );
      if (!res.success || !res.brief) {
        throw new Error(res.error || "Squad failed to compile dossier");
      }
      setBrief(video.videoId, res.brief);
      toast.success("INTEL DOSSIER compiled — 4 agents online", { id: "squad-ok" });
      void refreshCredits(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Squad uplink failed";
      setError(msg);
      toast.error(msg, { id: "squad-err" });
    }
  }

  const squadCredit = credits.actions?.squad;
  const threat = brief?.threatLevel ?? 0;
  const threatMeta = threatColor(threat);

  return (
    <Card className="glass-strong border-fuchsia-500/20 bracket">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="font-display text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-fuchsia-400" />
              INTEL DOSSIER
              <span className="ml-1 px-1.5 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30 text-[9px] font-mono font-black tracking-widest">
                4 AGENTS · SQUAD
              </span>
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">
              Forensic Scout/Crawler/Analyst/Comparator audit of the active competitor. One squad credit per dossier.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {squadCredit && (
              <GhostCreditBadge
                action="squad"
                remaining={squadCredit.remaining}
                limit={squadCredit.limit}
                allowed={squadCredit.allowed && isPro}
              />
            )}
            {isPro ? (
              <Button
                size="sm"
                onClick={runSquad}
                data-squad-run="1"
                disabled={isLoading || !video || (!!brief?.scout)}
                className="cyber-button text-[10px] px-3 h-8 font-display"
              >
                {isLoading ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />compiling dossier…</>
                  : brief?.scout ? <><CheckCircle2 className="w-3 h-3 mr-1" />dossier locked</>
                  : <><Zap className="w-3 h-3 mr-1" />Run Intel Squad</>}
              </Button>
            ) : (
              <Button size="sm" onClick={onUpgrade} className="cyber-button text-[10px] px-3 h-8 font-display">
                <Lock className="w-3 h-3 mr-1" />Unlock Squad
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!video ? (
          <div className="text-center py-8 text-muted-foreground text-xs font-mono">
            // select a competitor tile to compile a dossier
          </div>
        ) : error && !brief ? (
          <div className="p-3 rounded border border-red-500/30 bg-red-500/5 text-red-400 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">// SQUAD UPLINK FAILED</p>
              <p className="text-red-300/80 mt-1">{error}</p>
            </div>
          </div>
        ) : !brief ? (
          <div className="rounded border border-dashed border-fuchsia-500/20 bg-fuchsia-500/5 p-5 text-center space-y-2">
            <Radio className="w-6 h-6 text-fuchsia-400 mx-auto animate-pulse" />
            <p className="text-xs font-mono text-fuchsia-300">// SQUAD STANDBY</p>
            <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
              Run the 4-agent squad on <span className="text-foreground font-semibold">"{video.title.slice(0, 60)}{video.title.length > 60 ? "…" : ""}"</span> to extract hook architecture, retention loops, monetization signals, and 3 concrete attack vectors.
            </p>
          </div>
        ) : (
          <>
            {/* Threat level bar */}
            <div className="rounded-lg border border-red-500/30 bg-gradient-to-r from-red-950/40 via-card to-red-950/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Flame className={`w-4 h-4 ${threatMeta.text}`} />
                  <span className="font-mono text-[10px] tracking-widest uppercase text-foreground">Threat Level</span>
                  {brief.ghostReconstructed && (
                    <span className="text-[9px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                      ⚠ scaffold
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-display text-lg font-black ${threatMeta.text}`}>{threat}/100</span>
                  <span className={`text-[10px] font-mono font-bold ${threatMeta.text}`}>{threatMeta.label}</span>
                </div>
              </div>
              <div className="h-2 w-full bg-black/60 rounded-full overflow-hidden">
                <div className={cn("h-full transition-all duration-700", threatMeta.bar)} style={{ width: `${threat}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground font-mono">
                target: <span className="text-foreground">{brief.scout?.channelName || video.channelName}</span> · niche <span className="text-fuchsia-300">{brief.scout?.niche || savedNiche}</span> · model <span className="text-cyan-300">{brief.model || "ghost"}</span>
                {brief.criticAudit?.score != null && <> · critic <span className="text-emerald-400">{brief.criticAudit.score}/100</span></>}
              </p>
            </div>

            {/* Scout summary callout */}
            {brief.scout?.summary && (
              <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-xs">
                <div className="flex items-start gap-2">
                  <Target className="w-4 h-4 text-fuchsia-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-fuchsia-300 font-mono text-[10px] tracking-widest uppercase mb-1">SCOUT SYNTHESIS</p>
                    <p className="text-foreground/90 leading-relaxed">{brief.scout.summary}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <AgentSection id="scout" icon={Eye} title="SCOUT" subtitle="structural intel" defaultOpen>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div className="rounded bg-secondary/40 p-2 border border-border/50">
                    <p className="text-muted-foreground text-[9px] uppercase tracking-widest">Views</p>
                    <p className="text-foreground font-bold">{brief.scout?.views || video.views}</p>
                  </div>
                  <div className="rounded bg-secondary/40 p-2 border border-border/50">
                    <p className="text-muted-foreground text-[9px] uppercase tracking-widest">Velocity</p>
                    <p className="text-foreground font-bold">{brief.scout?.velocityScore ?? video.viralVelocityScore ?? "—"}/100</p>
                  </div>
                  <div className="rounded bg-secondary/40 p-2 border border-border/50">
                    <p className="text-muted-foreground text-[9px] uppercase tracking-widest">Est. Revenue</p>
                    <p className="text-emerald-400 font-bold">{brief.scout?.estimatedRevenue || video.estimatedRevenue || "$—"}</p>
                  </div>
                  <div className="rounded bg-secondary/40 p-2 border border-border/50">
                    <p className="text-muted-foreground text-[9px] uppercase tracking-widest">Channel</p>
                    <p className="text-foreground font-bold truncate">{brief.scout?.channelName || video.channelName}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">Early-warning signals</p>
                  <BulletList items={brief.scout?.signals} tone="warn" />
                </div>
              </AgentSection>

              <AgentSection id="crawler" icon={GitBranch} title="CRAWLER" subtitle={`transcript + ${brief.crawler?.comments?.length || 0} comments`}>
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary/60 border border-border/50 text-muted-foreground">source: {brief.crawler?.transcriptSource || "unknown"}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-secondary/60 border border-border/50 text-muted-foreground">sentiment: {brief.crawler?.topSentiment || "unknown"}</span>
                  {brief.crawler?.transcriptTruncated && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">transcript truncated</span>
                  )}
                </div>
                {brief.crawler?.transcriptPreview && (
                  <div className="rounded border border-border/50 bg-black/30 p-2 max-h-32 overflow-y-auto font-mono text-[10px] leading-relaxed text-foreground/70 whitespace-pre-wrap">
                    {brief.crawler.transcriptPreview}
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mt-2 mb-1">Key phrases</p>
                  <div className="flex flex-wrap gap-1">
                    {(brief.crawler?.keyPhrases || []).map((p, i) => (
                      <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20">{p}</span>
                    ))}
                  </div>
                </div>
                {brief.crawler?.comments && brief.crawler.comments.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mt-2 mb-1">Top comments</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {brief.crawler.comments.slice(0, 5).map((c, i) => (
                        <div key={i} className="text-[11px] rounded bg-secondary/30 p-2 border border-border/50">
                          <p className="text-cyan-300 font-mono text-[10px]">@{c.author} <span className="text-muted-foreground">· +{c.likeCount}</span></p>
                          <p className="text-foreground/80 mt-0.5">{c.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </AgentSection>

              <AgentSection id="analyst" icon={Terminal} title="ANALYST" subtitle="forensic rubric" defaultOpen>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">Hook architecture</p>
                    <p className="text-foreground/90">{brief.analyst?.hookArchitecture || "// pending"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">Retention loop map</p>
                    <BulletList items={brief.analyst?.retentionLoopMap} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">Monetization signals</p>
                    <BulletList items={brief.analyst?.monetizationSignals} tone="good" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">Weakness / exploitable gaps</p>
                    <BulletList items={brief.analyst?.weaknessGaps} tone="bad" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="rounded bg-secondary/40 p-2 border border-border/50">
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">CTA</p>
                      <p className="text-foreground/80">{brief.analyst?.ctaArchitecture || "—"}</p>
                    </div>
                    <div className="rounded bg-secondary/40 p-2 border border-border/50">
                      <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mb-1">Pacing / AVD</p>
                      <p className="text-foreground/80">{brief.analyst?.pacingAssessment || "—"}</p>
                    </div>
                  </div>
                </div>
              </AgentSection>

              <AgentSection id="comparator" icon={Swords} title="COMPARATOR" subtitle="SWOT + attack vectors" defaultOpen>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded bg-emerald-500/5 border border-emerald-500/20 p-2">
                    <p className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest mb-1">Strengths</p>
                    <BulletList items={brief.comparator?.strengths} tone="good" />
                  </div>
                  <div className="rounded bg-red-500/5 border border-red-500/20 p-2">
                    <p className="text-[10px] text-red-400 font-mono uppercase tracking-widest mb-1">Weaknesses</p>
                    <BulletList items={brief.comparator?.weaknesses} tone="bad" />
                  </div>
                  <div className="rounded bg-cyan-500/5 border border-cyan-500/20 p-2">
                    <p className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest mb-1">Opportunities</p>
                    <BulletList items={brief.comparator?.opportunities} />
                  </div>
                  <div className="rounded bg-orange-500/5 border border-orange-500/20 p-2">
                    <p className="text-[10px] text-orange-400 font-mono uppercase tracking-widest mb-1">Threats</p>
                    <BulletList items={brief.comparator?.threats} tone="warn" />
                  </div>
                </div>

                {brief.comparator?.differentiatorAngle && (
                  <div className="rounded border border-primary/30 bg-primary/5 p-2">
                    <p className="text-[10px] text-primary font-mono uppercase tracking-widest mb-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Differentiator angle
                    </p>
                    <p className="text-foreground text-[11px]">{brief.comparator.differentiatorAngle}</p>
                  </div>
                )}

                <div>
                  <p className="text-[10px] text-fuchsia-400 font-mono uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Attack Vectors (3)
                  </p>
                  <div className="space-y-2">
                    {(brief.comparator?.attackVectors || []).map((av, i) => (
                      <div key={i} className="rounded border border-fuchsia-500/20 bg-fuchsia-500/5 p-2">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-display text-xs font-black text-fuchsia-300">▸ {av.title}</p>
                          <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">{av.expectedLift}</span>
                        </div>
                        <p className="text-[11px] text-foreground/85 leading-relaxed">{av.tactic}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </AgentSection>
            </div>

            {brief.criticAudit && (
              <div className="text-[10px] font-mono text-muted-foreground flex items-center justify-between pt-1 border-t border-border/40">
                <span>critic: <span className={brief.criticAudit.score && brief.criticAudit.score >= 85 ? "text-emerald-400" : "text-amber-400"}>{brief.criticAudit.score}/100</span> · iterations {brief.criticAudit.iterations} {brief.criticAudit.selfHealed && "· self-healed"}</span>
                <span className="text-cyan-400">{brief.model}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
