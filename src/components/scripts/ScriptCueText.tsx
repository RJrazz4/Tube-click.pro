import { memo } from "react";
import { parseScriptCues } from "@/lib/scriptCues";
import { cn } from "@/lib/utils";

/**
 * Renders an LSA script string, styling [directorial cues] with a distinct
 * neon treatment so creators instantly see performance direction vs. spoken
 * lines. Falls back to plain text when there are no cues. Safe (no HTML injection).
 */
export const ScriptCueText = memo(function ScriptCueText({
  text,
  className,
}: {
  text?: string | null;
  className?: string;
}) {
  if (!text) return null;
  const segments = parseScriptCues(text);

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {segments.map((seg, i) =>
        seg.type === "cue" ? (
          <span
            key={i}
            title="Directorial cue"
            className="mx-0.5 inline-block rounded-md border border-fuchsia-500/25 bg-fuchsia-500/10 px-1.5 py-0.5 align-baseline text-[0.82em] font-medium italic text-fuchsia-300"
          >
            [{seg.value}]
          </span>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </span>
  );
});
