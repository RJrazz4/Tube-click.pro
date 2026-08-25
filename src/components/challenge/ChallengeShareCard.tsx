import { useCallback, useEffect, useRef, useState } from "react";
import { Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ChallengeState } from "@/lib/engine/types";
import { drawShareCard } from "./shareCanvas";

/**
 * The 1080×1080 share card — canvas-rendered client-side, zero backend.
 * Copy: "I out-published my old self 30 days straight" (only ever true
 * claims: streak + day count come from the server-authoritative state).
 */

const W = 1080;
const H = 1080;

export function ChallengeShareCard({ state }: { state: ChallengeState | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const render = useCallback(() => {
    if (!canvasRef.current || !state) return;
    drawShareCard(canvasRef.current, {
      streak: state.streak ?? 0,
      day: Math.min(state.elapsed_days ?? 1, 30),
      bestStreak: state.best_streak ?? 0,
      handle: "",
    });
    setUrl(canvasRef.current.toDataURL("image/png"));
  }, [state]);

  useEffect(() => {
    render();
  }, [render]);

  if (!state || state.status === "not_enrolled") return null;

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `tubeclick-challenge-day-${state.elapsed_days ?? 1}.png`;
    a.click();
    toast.success("Share card saved — post it and tag us 🚀");
  };

  const share = async () => {
    if (!url || !navigator.share) {
      download();
      return;
    }
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "tubeclick-challenge.png", { type: "image/png" });
      await navigator.share({ files: [file], title: "TubeClick Pro 30-Day Challenge" });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="space-y-3">
      <canvas ref={canvasRef} className="hidden" aria-hidden />
      {url && (
        <div className="grid grid-cols-[132px_1fr] gap-4 items-center rounded-xl border border-border/60 bg-card/40 p-3">
          <img src={url} alt="Challenge share card preview" className="rounded-lg border border-border/60 w-[132px] h-[132px]" />
          <div className="space-y-2">
            <p className="text-sm font-display font-semibold">Your champion card</p>
            <p className="text-xs text-muted-foreground">1080×1080 — streak verified by the engine. Share it at every milestone.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={download}>
                <Download className="w-4 h-4" /> PNG
              </Button>
              <Button size="sm" onClick={() => void share()}>
                <Share2 className="w-4 h-4" /> Share
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
