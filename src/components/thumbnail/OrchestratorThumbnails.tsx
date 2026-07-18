/**
 * Phase G3 — Intelligent Thumbnails: prompt → tier-faithful option cards.
 *
 * The count selector is F1-faithful: it shows ONLY what the user's tier
 * allows (options come from GET /api/v1/tiers with a plan-value offline
 * fallback; the server still validates every request). Cards carry the
 * same brand-quality + backup-engine badges as the storyboard.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Download,
  ImageOff,
  Loader2,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GenerationProgress } from "@/components/generation/GenerationProgress";
import { useTierConfig } from "@/hooks/useTierConfig";
import { orchestratorApi } from "@/lib/orchestrator/client";
import { downloadImage } from "@/lib/orchestrator/download";
import {
  toEngineTier,
  toSummaryStrip,
  type SceneCardView,
} from "@/lib/orchestrator/storyboard-view";
import {
  clampThumbnailCount,
  FALLBACK_TIER_CATALOG,
  optionFilename,
  thumbnailOptionViews,
  toThumbnailCardViews,
} from "@/lib/orchestrator/thumbnails-view";
import { toUiError, type UiError } from "@/lib/orchestrator/ui-error";
import type {
  OrchestratorThumbnailsResponse,
  TierCatalogEntry,
} from "@/lib/orchestrator/types";

const MIN_PROMPT_CHARS = 3;

export function OrchestratorThumbnails() {
  const { rawTier } = useTierConfig();
  const engineTier = toEngineTier(rawTier);

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [catalog, setCatalog] = useState<TierCatalogEntry[] | null>(null);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [result, setResult] = useState<OrchestratorThumbnailsResponse | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Tier catalog: authoritative options when reachable, plan defaults otherwise.
  useEffect(() => {
    let cancelled = false;
    orchestratorApi
      .tiers()
      .then((response) => {
        if (!cancelled) setCatalog(response.tiers);
      })
      .catch(() => {
        if (!cancelled) setCatalog(null); // fallback catalog in use
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveCatalog = catalog ?? FALLBACK_TIER_CATALOG;
  const options = thumbnailOptionViews(effectiveCatalog, engineTier);

  // Keep the chosen count inside the tier's allowed set whenever
  // the catalog or the tier changes.
  useEffect(() => {
    setCount((current) =>
      clampThumbnailCount(
        options.map((option) => option.count),
        current,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, engineTier]);

  const runGeneration = useCallback(async () => {
    setError(null);
    setBusy(true);
    setRunStartedAt(Date.now());
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const trimmedNegative = negativePrompt.trim();
      const response = await orchestratorApi.thumbnails(
        {
          prompt: prompt.trim(),
          count,
          ...(trimmedNegative !== "" ? { negativePrompt: trimmedNegative } : {}),
        },
        controller.signal,
      );
      setResult(response);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(toUiError(err));
    } finally {
      setBusy(false);
    }
  }, [prompt, negativePrompt, count]);

  const saveOption = useCallback(async (view: SceneCardView) => {
    if (!view.imageUrl) return;
    setDownloading(view.sceneIndex);
    try {
      await downloadImage(view.imageUrl, optionFilename(view.sceneIndex));
    } finally {
      setDownloading(null);
    }
  }, []);

  const cardViews = result ? toThumbnailCardViews(result) : [];
  const summary = result ? toSummaryStrip(result.summary) : null;
  const canRun = prompt.trim().length >= MIN_PROMPT_CHARS && !busy;

  return (
    <div className="space-y-6">
      {/* Input */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle className="font-display text-lg">Thumbnail concept</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="thumbnail-prompt">Prompt</Label>
            <Textarea
              id="thumbnail-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the thumbnail — subject, mood, composition…"
              className="min-h-[100px] resize-y"
              disabled={busy}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="thumbnail-negative">Avoid (optional)</Label>
            <Input
              id="thumbnail-negative"
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              placeholder="blurry, watermark, extra fingers…"
              disabled={busy}
            />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <Label htmlFor="thumbnail-count">Options per batch</Label>
              <Select
                value={String(count)}
                onValueChange={(value) => setCount(Number(value))}
                disabled={busy}
              >
                <SelectTrigger id="thumbnail-count" className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.count} value={String(option.count)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => void runGeneration()} disabled={!canRun}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Painting options…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate thumbnails
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error surface */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">{error.title}</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Busy state (G4): one slot per requested option + abortable run */}
      {busy && (
        <GenerationProgress
          headline={`Painting ${count} thumbnail option${count === 1 ? "" : "s"}`}
          skeletonCount={count}
          startedAt={runStartedAt ?? Date.now()}
          onCancel={() => abortRef.current?.abort()}
        />
      )}

      {/* Result */}
      {result && !busy && summary && (
        <div className="space-y-4">
          <div className="space-y-0.5">
            <p className="font-medium">{summary.headline.replace("scene", "option")}</p>
            {summary.fallbackNote && (
              <p className="text-sm text-muted-foreground">{summary.fallbackNote}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {cardViews.map((view) => (
              <Card key={view.sceneIndex} className="overflow-hidden border-border/60">
                <div className="relative aspect-video bg-muted/30">
                  {view.status === "success" && view.imageUrl ? (
                    <img
                      src={view.imageUrl}
                      alt={view.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                      <ImageOff className="h-6 w-6 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        This option didn't render — re-run to retry it.
                      </p>
                    </div>
                  )}
                </div>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{view.title}</p>
                    <span className="text-xs text-muted-foreground">{view.latencyLabel}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {view.qualityBadge && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            view.qualityBadge === "Tube.Pro"
                              ? "border-violet-500/40 text-violet-300"
                              : "border-cyan-500/40 text-cyan-300",
                          )}
                        >
                          {view.qualityBadge}
                        </Badge>
                      )}
                      {view.backupBadge && (
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">
                          backup engine
                        </Badge>
                      )}
                      {view.status === "failed" && (
                        <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                          failed
                        </Badge>
                      )}
                    </div>
                    {view.status === "success" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void saveOption(view)}
                        disabled={downloading === view.sceneIndex}
                        aria-label={`Download ${view.title}`}
                      >
                        {downloading === view.sceneIndex ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                  {view.status === "failed" && view.errorMessage && (
                    <p className="text-xs text-destructive/80 line-clamp-2">{view.errorMessage}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
