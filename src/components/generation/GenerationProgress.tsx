/**
 * Phase G4 — GenerationProgress: the shared honest busy state.
 *
 * Every generation surface (storyboard, thumbnails) renders the same
 * contract while work runs:
 *   - a skeleton slot per expected image (never more, never fewer)
 *   - a live ticking elapsed clock (long runs never feel frozen)
 *   - an optional Cancel button wired to the caller's AbortController
 *
 * Copy is supplied by callers; elapsed formatting is unit-locked in
 * lib/orchestrator/progress-view.
 */
import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatElapsedSeconds } from "@/lib/orchestrator/progress-view";

export interface GenerationProgressProps {
  /** Main status line, e.g. "Planning & painting your storyboard". */
  headline: string;
  /** Optional calmer sub-line under the clock. */
  note?: string;
  /** One skeleton slot per expected image — caller decides the truth. */
  skeletonCount: number;
  /** Date.now() when the run started (drives the ticking clock). */
  startedAt: number;
  /** When provided, shows a Cancel button (abort the run). */
  onCancel?: () => void;
}

export function GenerationProgress({
  headline,
  note,
  skeletonCount,
  startedAt,
  onCancel,
}: GenerationProgressProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const update = () =>
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  const slots = Math.max(1, skeletonCount);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: slots }, (_, slot) => (
          <div
            key={slot}
            className="aspect-video animate-pulse rounded-lg border border-border/60 bg-muted/40"
          />
        ))}
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {headline} — {formatElapsedSeconds(elapsedSeconds)}
          </span>
        </div>
        {note && <p className="text-center text-sm text-muted-foreground">{note}</p>}
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
