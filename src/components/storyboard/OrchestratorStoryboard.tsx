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
import { AlertCircle, Download, ImageOff, Loader2, Sparkles, X, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GenerationProgress } from "@/components/generation/GenerationProgress";
import { TruncationBanner } from "@/components/storyboard/TruncationBanner";
import { Processing3D } from "@/components/ui/Processing3D";
import { AIBrain2D } from "@/components/ui/AIBrain2D";
import { formatElapsedSeconds } from "@/lib/orchestrator/progress-view";
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

// Two-phase generation states
type GenerationPhase = "idle" | "text" | "images" | "complete";

/** Small phase indicator dot with label for the two-phase progress bar. */
function PhaseIndicator({
  label,
  active,
  completed,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  completed: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full transition-all",
          completed
            ? "bg-emerald-500/20 border-2 border-emerald-500"
            : active
            ? "bg-primary/20 border-2 border-primary ring-4 ring-primary/20"
            : "bg-muted/40 border-2 border-border/60",
        )}
      >
        {completed ? (
          <svg className="h-5 w-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <span className={cn("h-5 w-5 flex items-center justify-center", completed ? "text-emerald-500" : active ? "text-primary" : "text-muted-foreground")}>
            {Icon}
          </span>
        )}
      </div>
      <span className={cn("text-[11px] font-medium text-center max-w-[80px]", active ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  );
}

export function OrchestratorStoryboard() {
  const [script, setScript] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [result, setResult] = useState<OrchestratorStoryboardResponse | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [phaseStartedAt, setPhaseStartedAt] = useState<number | null>(null);
  /** Per-scene <img> onLoad flags — drives the per-card 3D loader. */
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
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
    setPhase("text");
    const now = Date.now();
    setRunStartedAt(now);
    setPhaseStartedAt(now);
    setLoaded({}); // reset per-card loaders for the new run
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Phase 1: Text processing (simulated - backend does it all at once)
      // We show the AI brain animation for a minimum time to let users perceive the "thinking"
      const minTextPhaseMs = 1800; // Minimum time to show text phase
      const textPhasePromise = new Promise<void>((resolve) => {
        const checkPhase = () => {
          if (Date.now() - now >= minTextPhaseMs) {
            setPhase("images");
            setPhaseStartedAt(Date.now());
            resolve();
          } else {
            setTimeout(checkPhase, 100);
          }
        };
        checkPhase();
      });

      // Start the API call in parallel
      const apiPromise = orchestratorApi.storyboard(
        { script: script.trim() },
        controller.signal,
      );

      // Wait for both minimum text phase time AND API response
      const [, response] = await Promise.all([textPhasePromise, apiPromise]);
      setPhase("complete");
      setResult(response);
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      setError(toUiError(err));
    } finally {
      setBusy(false);
      setPhase("idle");
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

  /** Mark a single scene's image as loaded (its 3D loader disappears). */
  const markLoaded = useCallback((idx: number) => {
    setLoaded((prev) => (prev[idx] ? prev : { ...prev, [idx]: true }));
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

      {/* Two-phase busy state: Text (AI Brain 2D) → Images (Processing3D).
          Only shown BEFORE the scene grid exists — once results arrive, the
          loader moves INTO each card (see SceneCardView below) so it spins
          independently per scene and clears when that scene's <img> loads. */}
      {busy && !result && (
        <div className="space-y-6">
          {/* Phase indicator tabs */}
          <div className="flex items-center justify-center gap-2">
            <PhaseIndicator
              label="Script Analysis"
              active={phase === "text" || phase === "images" || phase === "complete"}
              completed={phase === "images" || phase === "complete"}
              icon={<Zap className="h-4 w-4" />}
            />
            <div className="w-16 h-px bg-border/60" />
            <PhaseIndicator
              label="Image Generation"
              active={phase === "images" || phase === "complete"}
              completed={phase === "complete"}
              icon={<Sparkles className="h-4 w-4" />}
            />
          </div>

          {/* Phase content */}
          <div className="relative min-h-[280px]">
            {/* Phase 1: AI Brain 2D - Text Processing */}
            {phase === "text" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ animation: "fadeIn 0.3s ease" }}>
                <AIBrain2D
                  variant="inline"
                  brand="pro"
                  phases={[
                    "Reading script…",
                    "Analyzing narrative structure…",
                    "Identifying visual beats…",
                    "Crafting scene prompts…",
                    "Optimizing for generation…",
                  ]}
                  subLabel="The director is planning your storyboard"
                />
              </div>
            )}

            {/* Phase 2: Processing3D - Image Generation */}
            {(phase === "images" || phase === "complete") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ animation: "fadeIn 0.4s ease" }}>
                <Processing3D
                  variant="inline"
                  brand="pro"
                  size="md"
                  stages={[
                    "Initializing render pipeline…",
                    "Composing frames…",
                    "Rendering pixels…",
                    "Polishing details…",
                    "Finalizing output…",
                  ]}
                  subLabel={
                    phase === "complete"
                      ? "Storyboard complete!"
                      : "The director is painting each scene"
                  }
                />
              </div>
            )}
          </div>

          {/* Live clock + cancel */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {phase === "text"
                  ? "Analyzing script…"
                  : phase === "images"
                  ? "Generating images…"
                  : "Finalizing…"}
                — {formatElapsedSeconds(Math.max(0, Math.floor((Date.now() - (runStartedAt ?? Date.now())) / 1000)))}
              </span>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {phase === "text"
                ? "The director reads your script and plans every scene"
                : phase === "images"
                ? "Each frame is painted with cinematic quality"
                : "Almost ready…"}
            </p>
            <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Result — rendered as soon as results exist (even while the final
          client-side wiring finishes), with the 3D loader living inside
          each individual scene card. */}
      {result && summary && (
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
                <div className="relative aspect-video bg-muted/30 overflow-hidden">
                  {scene.status === "success" && scene.imageUrl ? (
                    <>
                      <img
                        src={scene.imageUrl}
                        alt={scene.title}
                        loading="lazy"
                        onLoad={() => markLoaded(scene.sceneIndex)}
                        onError={() => markLoaded(scene.sceneIndex)}
                        className={cn(
                          "h-full w-full object-cover transition-opacity duration-300",
                          loaded[scene.sceneIndex] ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {/* Per-card 3D loader — spins on top of THIS empty box
                          and only disappears when this scene's image loads. */}
                      {!loaded[scene.sceneIndex] && (
                        <div className="absolute inset-0 grid place-items-center bg-muted/40">
                          <Processing3D
                            variant="tile"
                            brand={result?.tier === "free" ? "free" : "pro"}
                            label={`Painting ${scene.title}…`}
                          />
                        </div>
                      )}
                    </>
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
                  {scene.status === "success" && scene.backupBadge && scene.errorMessage && (
                    <p className="text-[11px] text-amber-300/80 line-clamp-2">Backup engine used: {scene.errorMessage}</p>
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
