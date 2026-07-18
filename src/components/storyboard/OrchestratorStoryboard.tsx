/**
 * Phase G1 — Intelligent Storyboard: script → planned scenes → image grid.
 *
 * The orchestrator-backed storyboard experience (Phase A–F engine):
 * one click plans the storyboard AND paints every scene, then renders a
 * per-scene card grid with brand-quality + backup-engine badges. Failed
 * scenes are honest cards with their error — never silent gaps.
 *
 * User-facing copy comes from lib/orchestrator/storyboard-view (unit-test
 * locked against the Gate 4 provider-leak rules).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Download, ImageOff, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TruncationBanner } from "@/components/storyboard/TruncationBanner";
import { orchestratorApi } from "@/lib/orchestrator/client";
import { downloadZip } from "@/lib/orchestrator/download";
import { toUiError, type UiError } from "@/lib/orchestrator/ui-error";
import {
  toSceneCardViews,
  toSummaryStrip,
  type SceneCardView,
} from "@/lib/orchestrator/storyboard-view";
import type { OrchestratorStoryboardResponse } from "@/lib/orchestrator/types";

const SCRIPT_STORAGE_KEY = "tubeclick_intelligent_storyboard_script";
const MIN_SCRIPT_CHARS = 10;

export function OrchestratorStoryboard() {
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [result, setResult] = useState<OrchestratorStoryboardResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Script persistence (scenes stay in-memory; data URLs never persist).
  useEffect(() => {
    const saved = localStorage.getItem(SCRIPT_STORAGE_KEY);
    if (saved) setScript(saved);
  }, []);
  useEffect(() => {
    if (script.trim().length > 0) {
      localStorage.setItem(SCRIPT_STORAGE_KEY, script);
    }
  }, [script]);

  const runGeneration = useCallback(async () => {
    setError(null);
    setBusy(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await orchestratorApi.storyboard(
        { script: script.trim() },
        controller.signal,
      );
      setResult(response);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(toUiError(err));
    } finally {
      setBusy(false);
    }
  }, [script]);

  const downloadScenes = useCallback(async (scenes: SceneCardView[]) => {
    setZipping(true);
    try {
      await downloadZip(
        scenes
          .filter((scene) => scene.status === "success" && scene.imageUrl !== undefined)
          .map((scene) => ({
            url: scene.imageUrl as string,
            filename: `scene-${String(scene.sceneIndex + 1).padStart(2, "0")}.png`,
          })),
        "storyboard-scenes.zip",
      );
    } finally {
      setZipping(false);
    }
  }, []);

  const sceneViews = result ? toSceneCardViews(result.scenes) : [];
  const summary = result ? toSummaryStrip(result.summary) : null;
  const canRun = script.trim().length >= MIN_SCRIPT_CHARS && !busy;

  return (
    <div className="space-y-6">
      {/* Input */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle className="font-display text-lg">Your script</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder="Paste your video script here — the director plans scenes, then paints each one…"
            className="min-h-[180px] resize-y"
            disabled={busy}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {script.trim().length < MIN_SCRIPT_CHARS
                ? `At least ${MIN_SCRIPT_CHARS} characters to begin.`
                : `${script.trim().length} characters ready.`}
            </p>
            <Button onClick={() => void runGeneration()} disabled={!canRun}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Planning &amp; painting…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate storyboard
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

      {/* Busy skeleton */}
      {busy && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((slot) => (
            <div
              key={slot}
              className="aspect-video animate-pulse rounded-lg border border-border/60 bg-muted/40"
            />
          ))}
          <p className="col-span-full text-center text-sm text-muted-foreground">
            The director is planning your scenes and painting each frame — a full
            storyboard takes about a minute.
          </p>
        </div>
      )}

      {/* Result */}
      {result && !busy && summary && (
        <div className="space-y-4">
          <TruncationBanner body={result} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="font-medium">{summary.headline}</p>
              {summary.fallbackNote && (
                <p className="text-sm text-muted-foreground">{summary.fallbackNote}</p>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => void downloadScenes(sceneViews)}
              disabled={zipping || summary.headline.startsWith("0 ")}
            >
              {zipping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download scenes (.zip)
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sceneViews.map((scene) => (
              <Card key={scene.sceneIndex} className="overflow-hidden border-border/60">
                <div className="relative aspect-video bg-muted/30">
                  {scene.status === "success" && scene.imageUrl ? (
                    <img
                      src={scene.imageUrl}
                      alt={scene.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                      <ImageOff className="h-6 w-6 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        This scene didn't render — re-run to retry it.
                      </p>
                    </div>
                  )}
                </div>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{scene.title}</p>
                    <span className="text-xs text-muted-foreground">{scene.latencyLabel}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {scene.qualityBadge && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          scene.qualityBadge === "Tube.Pro"
                            ? "border-violet-500/40 text-violet-300"
                            : "border-cyan-500/40 text-cyan-300",
                        )}
                      >
                        {scene.qualityBadge}
                      </Badge>
                    )}
                    {scene.backupBadge && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">
                        backup engine
                      </Badge>
                    )}
                    {scene.status === "failed" && (
                      <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">
                        failed
                      </Badge>
                    )}
                  </div>
                  {scene.status === "failed" && scene.errorMessage && (
                    <p className="text-xs text-destructive/80 line-clamp-2">{scene.errorMessage}</p>
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
