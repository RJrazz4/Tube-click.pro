/**
 * src/components/ghost/DawnPatrolCard.tsx
 *
 * MP6 Dawn Patrol sunrise card. Renders the latest brief (headline + 3
 * bullets + opportunities/threat tags), a "Generate now" CTA that
 * fires the ghost/dawn-patrol-generate endpoint with the current
 * conveyor competitors, and a mark-read button that clears the unread
 * dot.
 *
 * Surface this on the Dashboard as a "today at a glance" brief; the
 * panel is below the conveyor matrix.
 */
import { useState } from "react";
import { Sunrise, Loader2, Check, RefreshCw, Zap, AlertTriangle, Target, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDawnPatrol } from "@/hooks/useDawnPatrol";
import { useDawnPatrolStore } from "@/stores/useDawnPatrolStore";
import { useCloneCrushStore } from "@/stores/useCloneCrushStore";
import { useGhostCredits } from "@/hooks/useGhostCredits";
import { GhostCreditBadge } from "./GhostCreditBadge";
import { useIsPro } from "@/stores/useAuthStore";

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch { return d; }
}

export function DawnPatrolCard() {
  const isPro = useIsPro();
  const { credits, refresh: refreshCredits } = useGhostCredits();
  const dpCredit = credits.actions?.dawn_patrol;
  const { generate, markRead, isLoading, briefs, saveConfig } = useDawnPatrol();
  const config = useDawnPatrolStore((s) => s.config);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefsEnabled, setPrefsEnabled] = useState(config?.enabled !== false);
  const [prefsHour, setPrefsHour] = useState(config?.send_hour ?? 7);
  const latest = useDawnPatrolStore((s) => s.latest);
  const unread = useDawnPatrolStore((s) => s.unreadCount);
  const generating = useDawnPatrolStore((s) => s.generating);
  const competitors = useCloneCrushStore((s) => s.competitors);
  const savedNiche = useCloneCrushStore((s) => s.savedNiche);

  const allowed = isPro && dpCredit?.allowed === true;

  async function fireGenerate() {
    if (generating) return;
    if (!allowed) {
      toast.error("The daily competitive brief is a Pro feature");
      return;
    }
    const comps = (competitors || []).slice(0, 6).map((c) => ({
      videoId: c.videoId,
      title: c.title,
      url: c.url,
      views: c.views,
      viewsCount: c.viewsCount,
      channelName: c.channelName,
      viralVelocityScore: c.viralVelocityScore,
      publishedAt: c.publishedAt,
    }));
    const prev = briefs[0]
      ? { headline: briefs[0].headline, bullets: briefs[0].bullets }
      : null;
    await generate.mutateAsync({
      niche: savedNiche || "",
      competitors: comps,
      prevBrief: prev,
    });
    void refreshCredits(true);
  }

  function onMarkRead() {
    if (!latest) return;
    void markRead(latest.id);
  }

  return (
    <Card className="glass-strong border-amber-400/20 bracket relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.6),transparent_60%)]" />

      <CardHeader className="pb-3 relative">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="font-display text-sm flex items-center gap-2">
              <Sunrise className="w-4 h-4 text-amber-300" />
              Daily competitive brief
              <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30 text-[9px] font-mono font-black tracking-widest">
                DAWN PATROL · PRO
              </span>
              {unread > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-black text-[9px] font-black">
                  {unread}
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">
              A short daily summary of competitor movement and one action to take today.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {allowed && dpCredit && (
              <GhostCreditBadge
                action="dawn_patrol"
                remaining={dpCredit.remaining}
                limit={dpCredit.limit}
                allowed={true}
              />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 relative">
        {!allowed ? (
          <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-5 flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-400/30 flex items-center justify-center">
              <Sunrise className="w-6 h-6 text-amber-300" />
            </div>
            <p className="font-mono text-xs tracking-widest text-amber-300">// DAILY BRIEF LOCKED</p>
            <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
              Get a short competitor summary and one recommended action each day.
            </p>
            <Button asChild size="sm" className="cyber-button text-[10px] font-display mt-1">
              <a href="/rewards?upsell=dawn-patrol&tier=pro">See Pro options</a>
            </Button>
          </div>
        ) : !latest ? (
          <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sunrise className="w-4 h-4 text-amber-300" />
              <p className="text-xs font-mono text-amber-300">// NO BRIEF YET TODAY</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Run today&apos;s brief now — scans your current competitor list and returns a short summary in about 15 seconds.
            </p>
            <Button
              size="sm"
              onClick={fireGenerate}
              disabled={generating || isLoading}
              className="cyber-button text-[10px] h-8 font-display"
            >
              {generating ? (
                <><Loader2 className="w-3 h-3 animate-spin mr-1" /> compiling sunrise brief…</>
              ) : (
                <><Zap className="w-3 h-3 mr-1" /> Run today&apos;s brief (1 credit)</>
              )}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
                  {formatDate(latest.brief_date)}
                  {latest.read_at ? <span className="ml-2 text-emerald-400">• READ</span> : <span className="ml-2 text-amber-300">• NEW</span>}
                </p>
                <p className={cn("text-sm font-display leading-snug mt-1", !latest.read_at && "text-amber-100")}>
                  {latest.headline}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-amber-300"
                onClick={fireGenerate}
                disabled={generating}
                title="Regenerate today's brief"
              >
                {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              </Button>
            </div>

            <ul className="space-y-1.5">
              {(latest.bullets || []).map((b, i) => (
                <li key={i} className="flex gap-2 text-[11px] leading-relaxed text-foreground/90">
                  <span className="text-amber-300 font-mono shrink-0 mt-px">{String(i + 1).padStart(2, "0")}</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            {(latest.opportunities?.length > 0 || latest.threats?.length > 0) && (
              <div className="flex flex-wrap gap-1 pt-1">
                {latest.opportunities?.slice(0, 4).map((o, i) => (
                  <Badge key={`o-${i}`} variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-mono">
                    <Target className="w-2.5 h-2.5 mr-1" />{o}
                  </Badge>
                ))}
                {latest.threats?.slice(0, 4).map((t, i) => (
                  <Badge key={`t-${i}`} variant="outline" className="text-[9px] px-1.5 py-0 bg-rose-500/10 border-rose-500/30 text-rose-300 font-mono">
                    <AlertTriangle className="w-2.5 h-2.5 mr-1" />{t}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <p className="text-[9px] font-mono text-muted-foreground">
                model: <span className="text-amber-300/80">{latest.model || "flash"}</span>
                {" • "}
                tracked: <span className="text-amber-300/80">{(latest.competitor_delta as any)?.tracked ?? 0}</span>
              </p>
              <div className="flex items-center gap-1">
                {!latest.read_at && (
                  <Button size="sm" variant="ghost" className="h-7 text-[10px] font-display text-amber-300 hover:text-amber-100" onClick={onMarkRead}>
                    <Check className="w-3 h-3 mr-1" /> mark read
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-amber-300" onClick={() => setShowPrefs((v) => !v)} title="Delivery preferences">
                  <Settings2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </>
        )}

        {allowed && showPrefs && (
          <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 space-y-2 mt-1">
            <p className="text-[10px] font-mono text-amber-300 tracking-widest">// SUNRISE SCHEDULE (UTC)</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px]">Daily auto-brief</span>
              <Button
                size="sm"
                variant={prefsEnabled ? "default" : "outline"}
                className={prefsEnabled ? "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 h-7 text-[10px]" : "h-7 text-[10px]"}
                onClick={() => setPrefsEnabled((v) => {
                  const nv = !v;
                  void saveConfig({ enabled: nv, send_hour: prefsHour });
                  return nv;
                })}
              >
                {prefsEnabled ? "On" : "Off"}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px]">Deliver at (UTC hour)</span>
              <select
                value={prefsHour}
                onChange={(e) => {
                  const h = parseInt(e.target.value, 10);
                  setPrefsHour(h);
                  void saveConfig({ enabled: prefsEnabled, send_hour: h });
                }}
                className="bg-secondary/60 border border-border rounded h-7 px-2 text-[11px] font-mono"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
            <p className="text-[9px] text-muted-foreground font-mono">
              Email delivery reserved • in-app toast + card active.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
