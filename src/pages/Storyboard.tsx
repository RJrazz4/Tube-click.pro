/**
 * Phase G1 — Storyboard page (orchestrator generation).
 *
 * The intelligent pipeline front page: paste a script, get a planned,
 * tier-capped, fully-painted storyboard. The previous edge-driven flow
 * remains available at /storyboard/legacy while the migration completes.
 */
import { Clapperboard } from "lucide-react";

import { OrchestratorStoryboard } from "@/components/storyboard/OrchestratorStoryboard";

export default function Storyboard() {
  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Clapperboard className="w-6 h-6 md:w-7 md:h-7 text-purple-400" />
          Visual Storyboard AI
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          One click: your script becomes a planned, painted storyboard — scenes
          are framed, routed, and rendered by the intelligent engine.
        </p>
      </div>

      <OrchestratorStoryboard />
    </div>
  );
}
