import { useContentStore } from "@/stores/useContentStore";
import { useMemo } from "react";

/**
 * Phase A2 — Instant UI via Zustand selector memoization
 * Prevents Dashboard re-renders when unrelated state changes
 * Replaces polling setInterval with reactive subscription
 */

export function useContentStats() {
  const stats = useContentStore((s) => s.stats);
  const contents = useContentStore((s) => s.contents);

  const totalContent = contents.length;

  const recentContent = useMemo(() => contents.slice(0, 5), [contents]);

  const statCards = useMemo(
    () => [
      { key: "scriptsGenerated" as const, label: "Scripts Generated", value: stats.scriptsGenerated },
      { key: "thumbnailsCreated" as const, label: "Thumbnails Created", value: stats.thumbnailsCreated },
      { key: "voiceoversGenerated" as const, label: "Voiceovers Made", value: stats.voiceoversGenerated },
      { key: "guidesCreated" as const, label: "Guides Created", value: stats.guidesCreated },
    ],
    [stats]
  );

  return { stats, contents, totalContent, recentContent, statCards };
}

export function useContentActions() {
  const incrementStat = useContentStore((s) => s.incrementStat);
  const saveContent = useContentStore((s) => s.saveContent);
  const deleteContent = useContentStore((s) => s.deleteContent);
  const clearAll = useContentStore((s) => s.clearAll);

  return { incrementStat, saveContent, deleteContent, clearAll };
}
