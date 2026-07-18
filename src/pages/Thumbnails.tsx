/**
 * Phase G3 — Thumbnails page (orchestrator generation).
 *
 * One prompt, N tier-faithful options, brand badges on every card.
 * The previous edge-driven flow remains at /thumbnails/legacy while the
 * migration completes.
 */
import { Image as ImageIcon } from "lucide-react";

import { OrchestratorThumbnails } from "@/components/thumbnail/OrchestratorThumbnails";

export default function Thumbnails() {
  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <ImageIcon className="w-6 h-6 md:w-7 md:h-7 text-purple-400" />
          AI Thumbnails
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Describe the shot — get polished, click-worthy thumbnail options in one batch.
        </p>
      </div>

      <OrchestratorThumbnails />
    </div>
  );
}
