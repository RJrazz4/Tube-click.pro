import { useCallback, useEffect, useState } from "react";
import { Flame, Loader2, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { engineConfigured, fetchTrendRadar, type TrendItem } from "@/lib/engine/client";

function fmtViews(v: number | null): string {
  if (v == null) return "";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

function Thumb({ item }: { item: TrendItem }) {
  const [broken, setBroken] = useState(false);
  if (!item.thumbnail || broken) {
    return <div className="h-full w-full rounded-lg bg-primary/10 flex items-center justify-center"><Flame className="h-4 w-4 text-primary/60" /></div>;
  }
  return <img src={item.thumbnail} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full rounded-lg object-cover" />;
}

/**
 * Trend Radar — live, keyless YouTube intelligence surfaced on the creator home.
 * Backed by the engine's zero-cost /api/trends (oEmbed + Piped mirrors, Redis-cached).
 * Renders nothing when the engine isn't configured, so it's safe on every deployment.
 */
export function TrendRadarCard() {
  const [items, setItems] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [configured] = useState(() => engineConfigured());

  const load = useCallback(async (topic: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const radar = await fetchTrendRadar(topic ?? undefined);
      setItems(radar.items);
      setActiveTopic(radar.topic);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      setError(status === 401 ? "Sign in to unlock live trend intel." : "Live trends unavailable right now.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (configured) void load(null);
  }, [configured, load]);

  if (!configured) return null;

  return (
    <Card className="glass-strong border-border hover:border-primary/30 transition-colors bracket">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display text-base flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />Trend Radar
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              {activeTopic ? `Live results for “${activeTopic}”` : "What's trending on YouTube right now"}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void load(activeTopic)} disabled={loading} aria-label="Refresh trends">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-primary" : "text-muted-foreground"}`} />
          </Button>
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(query.trim() || null);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scan a topic (e.g. ai side hustle)"
              className="w-full rounded-xl border border-border bg-secondary/50 pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          <Button type="submit" disabled={loading} className="shrink-0">Scan</Button>
        </form>
      </CardHeader>
      <CardContent>
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{error}</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No trends returned — try a different topic.</p>
        ) : (
          <ul className="space-y-2">
            {items.slice(0, 6).map((item, i) => (
              <li key={item.videoId}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group flex items-center gap-3 p-2 rounded-xl border border-border/40 bg-secondary/30 hover:border-primary/40 transition-all"
                >
                  <span className="w-6 text-center font-mono text-xs text-primary/70">{i + 1}</span>
                  <div className="h-10 w-16 shrink-0 rounded-lg overflow-hidden"><Thumb item={item} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.channel}{item.views != null ? ` • ${fmtViews(item.views)} views` : ""}
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
