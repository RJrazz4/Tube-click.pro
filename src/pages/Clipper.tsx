import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Link2, Loader2, Scissors, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  engineConfigured,
  getClip,
  requestClip,
  type ClipStatus,
} from "@/lib/engine/client";

type Phase = "idle" | "submitting" | "processing" | "done" | "error";
type CaptionStyle = "karaoke" | "bold" | "minimal";

const DURATIONS = [15, 30, 45] as const;
const STYLES: Array<{ id: CaptionStyle; label: string }> = [
  { id: "karaoke", label: "Karaoke" },
  { id: "bold", label: "Bold" },
  { id: "minimal", label: "Minimal" },
];

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued — waiting for a worker",
  captions: "Pulling the transcript",
  select: "Finding the most viral moment",
  download: "Downloading the clip segment",
  "captions-render": "Styling captions",
  encode: "Rendering vertical video",
  upload: "Uploading your short",
  completed: "Done",
};

function friendly(err: unknown): string {
  const e = err as { status?: number; message?: string };
  if (e?.status === 401) return "Please sign in to generate clips.";
  if (e?.status === 429) return e.message ?? "Daily clip limit reached. Try again tomorrow.";
  if (e?.status === 503) return "The clipper is warming up. Please try again in a minute.";
  return e?.message ?? "Something went wrong while generating your clip.";
}

export default function Clipper() {
  const [configured] = useState(() => engineConfigured());
  const [url, setUrl] = useState("");
  const [duration, setDuration] = useState<number>(30);
  const [style, setStyle] = useState<CaptionStyle>("karaoke");
  const [autoSelect, setAutoSelect] = useState(true);

  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [clip, setClip] = useState<ClipStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorsRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // Poll the job while it is in flight. Transient failures (timeout, network
  // blip, cold start, 5xx) do NOT abort — the worker keeps rendering in the
  // background, so we keep polling. Only auth loss, a missing job, an explicit
  // failed status, or a long sustained outage stop the spinner.
  useEffect(() => {
    if (phase !== "processing" || !jobId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const status = await getClip(jobId);
        if (cancelled) return;
        errorsRef.current = 0;
        setClip(status);
        if (status.status === "completed") {
          setPhase("done");
          return;
        }
        if (status.status === "failed") {
          setError(status.error ?? "The render failed. Please try again.");
          setPhase("error");
          return;
        }
      } catch (err) {
        if (cancelled) return;
        const status = (err as { status?: number })?.status;
        if (status === 401 || status === 403) {
          setError(friendly(err));
          setPhase("error");
          return;
        }
        if (status === 404) {
          setError("This clip job expired. Please generate it again.");
          setPhase("error");
          return;
        }
        errorsRef.current += 1;
        if (errorsRef.current >= 12) {
          setError("We lost contact with the engine while rendering. Your clip may still be finishing — refresh in a minute or try again.");
          setPhase("error");
          return;
        }
      }
      pollRef.current = setTimeout(tick, 3000);
    };

    pollRef.current = setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [phase, jobId, stopPolling]);

  const onGenerate = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Paste a YouTube link first");
      return;
    }
    stopPolling();
    errorsRef.current = 0;
    setClip(null);
    setError(null);
    setPhase("submitting");
    try {
      const enq = await requestClip({
        url: trimmed,
        durationSeconds: duration,
        captionStyle: style,
        autoSelect,
      });
      setJobId(enq.jobId);
      setPhase("processing");
    } catch (err) {
      setError(friendly(err));
      setPhase("error");
    }
  };

  const busy = phase === "submitting" || phase === "processing";
  const stageKey = clip?.stage ?? "queued";
  const progress = clip?.progress ?? (phase === "submitting" ? 5 : 0);

  if (!configured) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Scissors className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 font-display text-2xl font-bold">Viral Shorts Clipper</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The clipper engine isn't configured for this deployment yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 shadow-lg">
            <Scissors className="h-5 w-5 text-white" />
          </span>
          <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">Viral Shorts Clipper</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Drop any YouTube link. We find the highest-retention moment and render a vertical short with
          burned-in captions — automatically.
        </p>
      </div>

      <Card className="glass-strong border-border bracket">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Create a clip</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Paste a YouTube URL (watch, youtu.be, or shorts).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void onGenerate();
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              className="pl-9"
              disabled={busy}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Length</span>
              <div className="flex gap-1 rounded-lg border border-border p-1">
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={busy}
                    onClick={() => setDuration(d)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      duration === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Captions</span>
              <div className="flex gap-1 rounded-lg border border-border p-1">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setStyle(s.id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      style === s.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={autoSelect}
                disabled={busy}
                onChange={(e) => setAutoSelect(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Auto-pick the viral moment
            </label>
          </div>

          <Button onClick={onGenerate} disabled={busy} className="w-full gap-2 sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Generating…" : "Generate Clip"}
          </Button>
        </CardContent>
      </Card>

      {/* Processing state */}
      {busy && (
        <Card className="glass-strong mt-4 border-border bracket">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {phase === "submitting" ? "Starting the engine…" : (STAGE_LABELS[stageKey] ?? "Working…")}
                </p>
                <p className="text-xs text-muted-foreground">Processing… this can take 1–3 minutes. Keep this page open.</p>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-600 transition-all duration-500"
                style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <div className="aspect-[9/16] w-full max-w-[160px] animate-pulse rounded-xl bg-secondary" />
              <div className="space-y-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {phase === "error" && error && (
        <Card className="mt-4 border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Couldn't generate that clip</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {phase === "done" && clip?.url && (
        <Card className="glass-strong mt-4 border-border bracket">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-display text-base">
              <CheckCircle2 className="h-4 w-4 text-green-400" /> Your short is ready
            </CardTitle>
            {clip.selection && (
              <CardDescription className="text-sm text-muted-foreground">
                Auto-selected {clip.selection.startSeconds}s–{clip.selection.startSeconds + clip.selection.durationSeconds}s
                {" · "}
                <span className="capitalize">{clip.selection.peakType}</span> peak
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <video
              src={clip.url}
              controls
              playsInline
              preload="metadata"
              className="mx-auto aspect-[9/16] w-full max-w-[300px] rounded-xl border border-border bg-black"
            />
            <div className="flex justify-center">
              <Button asChild variant="outline" className="gap-2">
                <a href={clip.url} target="_blank" rel="noreferrer noopener" download>
                  <Download className="h-4 w-4" /> Download MP4
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
