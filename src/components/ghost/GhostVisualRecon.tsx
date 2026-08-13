/**
 * src/components/ghost/GhostVisualRecon.tsx
 *
 * Ghost Visual Recon panel (MP5, BLACK-OPS LANE). Renders below the
 * INTEL DOSSIER card. Free/Pro users see a lock + upsell to Black-Ops;
 * Black-Ops cleared users see:
 *   - "Extract Visual DNA" CTA (fires recon-ingest, 1 credit/video).
 *   - Once indexed: a text search box that queries recon-search and
 *     returns timestamped thumbnails with clickable ?t= deep-links.
 */
import { useEffect, useState } from "react";
import {
  Radar, Loader2, Lock, Eye, Search, Zap,
  Target, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { fetchEdgeFunctionJson } from "@/api/client/secureClient";
import { useReconStore, type ReconFrame } from "@/stores/useReconStore";
import { useGhostCredits } from "@/hooks/useGhostCredits";
import { GhostCreditBadge } from "./GhostCreditBadge";
import { useIsPro } from "@/stores/useAuthStore";

interface Props {
  video: { videoId: string; title: string; url: string; thumbnail?: string } | null;
  savedNiche: string;
  onUpgrade?: () => void;
  slotId?: number;
}

function formatTs(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "00:00";
  const sec = Math.floor(s);
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(mm)}:${pad(r)}` : `${pad(mm)}:${pad(r)}`;
}

export function GhostVisualRecon({ video, savedNiche, onUpgrade, slotId = 0 }: Props) {
  const isPro = useIsPro();
  const { credits, refresh: refreshCredits } = useGhostCredits();
  const isBlackOps = credits.isBlackOps === true;
  const reconCredit = credits.actions?.recon;
  const allowed = isPro && (reconCredit?.allowed === true || isBlackOps);

  const get = useReconStore((s) => s.get);
  const setIngesting = useReconStore((s) => s.setIngesting);
  const setReady = useReconStore((s) => s.setReady);
  const setSearching = useReconStore((s) => s.setSearching);
  const setSearchResults = useReconStore((s) => s.setSearchResults);
  const setError = useReconStore((s) => s.setError);

  const vid = video?.videoId ?? "";
  const state = vid ? get(vid) : null;
  const [query, setQuery] = useState("");

  useEffect(() => { if (state?.error) toast.error(state.error, { id: "recon-error" }); }, [state?.error]);

  async function ingest() {
    if (!video) return;
    setIngesting(video.videoId, true);
    try {
      const r = await fetchEdgeFunctionJson<{ success: boolean; framesIndexed?: number; error?: string; code?: string }>(
        "ghost/recon-ingest",
        { video, slotId, savedNiche },
      );
      if (!r.success) throw new Error(r.error || "Ingest failed");
      // Seed frames: we don't return all captions to keep payload small.
      // Fire a wildcard search ("*") to hydrate visible frames? Instead,
      // call a blanket-ish pass with a short anchor query so the UI shows
      // all frames ordered by ts.
      const all = await fetchEdgeFunctionJson<{ success: boolean; results?: ReconFrame[]; error?: string; code?: string }>(
        "ghost/recon-search",
        { videoId: video.videoId, query: "frame" },
      );
      const frames = all.success && Array.isArray(all.results) && all.results.length
        ? all.results.sort((a, b) => a.tsSeconds - b.tsSeconds)
        : [];
      setReady(video.videoId, frames);
      toast.success(`Visual DNA locked — ${r.framesIndexed ?? frames.length} frames indexed`, { id: "recon-ok" });
      void refreshCredits(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Recon failed";
      setError(video.videoId, msg);
      toast.error(msg, { id: "recon-err" });
    }
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!video || !query.trim()) return;
    setSearching(video.videoId, true);
    try {
      const r = await fetchEdgeFunctionJson<{ success: boolean; results?: ReconFrame[]; error?: string; code?: string }>(
        "ghost/recon-search",
        { videoId: video.videoId, query: query.trim() },
      );
      if (!r.success) throw new Error(r.error || "Search failed");
      setSearchResults(video.videoId, query.trim(), r.results || []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Search failed";
      if (msg.toLowerCase().includes("not indexed")) {
        // Fire ingest automatically, tell user.
        toast.loading("Frames not indexed — extracting visual DNA…", { id: "recon-auto" });
        void ingest();
      } else {
        toast.error(msg, { id: "recon-search-err" });
      }
      setError(video.videoId, msg);
    }
  }

  const frames = state?.frames ?? [];
  const results = state?.searchResults ?? [];
  const showing = state?.lastQuery ? results : frames;

  return (
    <Card className="glass-strong border-cyan-400/20 bracket relative overflow-hidden">
      {/* Cyberpunk neon corner accents */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.6),transparent_60%)]" />

      <CardHeader className="pb-3 relative">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="font-display text-sm flex items-center gap-2">
              <Radar className="w-4 h-4 text-cyan-300" />
              VISUAL RECON
              <span className="ml-1 px-1.5 py-0.5 rounded bg-cyan-400/15 text-cyan-300 border border-cyan-400/30 text-[9px] font-mono font-black tracking-widest">
                ⚡ BLACK-OPS LANE
              </span>
            </CardTitle>
            <CardDescription className="text-[11px] mt-1">
              Multimodal frame-level visual search across competitor moments. One recon credit per video.
            </CardDescription>
          </div>
          {allowed && reconCredit && (
            <GhostCreditBadge
              action="recon"
              remaining={reconCredit.remaining}
              limit={reconCredit.limit}
              allowed={true}
              isBlackOps={isBlackOps}
            />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 relative">
        {!allowed ? (
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-5 flex flex-col items-center text-center gap-2">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center">
              <Lock className="w-6 h-6 text-cyan-300" />
            </div>
            <p className="font-mono text-xs tracking-widest text-cyan-300">// BLACK-OPS CLEARANCE REQUIRED</p>
            <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed">
              Visual DNA extraction, thumbnail heists, and moment-level search are reserved for Black-Ops operatives.
            </p>
            <Button asChild size="sm" className="cyber-button text-[10px] font-display mt-1">
              <a href="/rewards?upsell=recon&tier=pro">Request Clearance</a>
            </Button>
          </div>
        ) : !video ? (
          <div className="text-center text-xs text-muted-foreground py-6 font-mono">// select a video to scan</div>
        ) : (
          <>
            {!state?.ready ? (
              <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-300" />
                  <p className="text-xs font-mono text-cyan-300">// EXTRACT VISUAL DNA</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Scout 12 evenly-spaced keyframes across the video, caption each with multimodal Flash, and
                  embed the captions for semantic frame search (~20s).
                </p>
                <Button
                  size="sm"
                  onClick={ingest}
                  disabled={state?.ingesting}
                  data-recon-ingest="1"
                  className="cyber-button text-[10px] h-8 font-display"
                >
                  {state?.ingesting ? (
                    <><Loader2 className="w-3 h-3 animate-spin mr-1" /> extracting frames…</>
                  ) : (
                    <><Zap className="w-3 h-3 mr-1" /> Extract Visual DNA (1 credit)</>
                  )}
                </Button>
              </div>
            ) : (
              <>
                <form onSubmit={search} className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="red arrow pointing, SHOCKED face, text 'EXPOSED', b-roll money…"
                    className="bg-secondary/60 border-border font-mono text-xs h-9"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={state?.searching || !query.trim()}
                    className="cyber-button h-9 text-[10px] font-display px-3"
                  >
                    {state?.searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                  </Button>
                </form>



                <div>
                  <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Target className="w-3 h-3 text-cyan-300" />
                    {state.lastQuery ? `MATCHES: "${state.lastQuery}"` : `SAMPLED FRAMES (${showing.length})`}
                  </p>
                  {showing.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-xs font-mono">// no frames yet</div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {showing.map((f) => (
                        <a
                          key={`${f.frameIdx}-${f.tsSeconds}`}
                          href={f.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative rounded-lg border border-border/70 bg-secondary/30 overflow-hidden hover:border-cyan-400/60 transition-colors"
                        >
                          <div className="relative aspect-video bg-black">
                            {/* Use YouTube's i.ytimg.com thumb with fallback to the exact frame URL */}
                            <img
                              src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover opacity-0"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                              onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
                            />
                            <img
                              src={f.thumbUrl}
                              alt={`frame @ ${formatTs(f.tsSeconds)}`}
                              loading="lazy"
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
                              }}
                            />
                            <div className="absolute top-1 left-1 bg-black/80 border border-cyan-400/40 text-cyan-300 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold">
                              {formatTs(f.tsSeconds)}
                            </div>
                            {typeof f.similarity === "number" && f.similarity > 0 && (
                              <div className="absolute top-1 right-1 bg-black/80 border border-fuchsia-400/40 text-fuchsia-300 px-1.5 py-0.5 rounded text-[9px] font-mono">
                                {(f.similarity * 100).toFixed(0)}%
                              </div>
                            )}
                          </div>
                          <div className="p-2 space-y-1">
                            <p className="text-[10px] text-foreground/90 leading-snug line-clamp-3">{f.caption}</p>
                            {f.visualTags && f.visualTags.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {f.visualTags.slice(0, 4).map((t, i) => (
                                  <span key={i} className="text-[8px] font-mono bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 px-1 py-px rounded">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-[9px] font-mono text-muted-foreground flex items-center gap-1 pt-1 border-t border-border/40">
                  <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                  click any frame to open YouTube at that exact moment
                </p>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
