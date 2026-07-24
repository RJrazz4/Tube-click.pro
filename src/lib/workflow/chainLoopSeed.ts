/**
 * Chain-Loop → TubeBot seed mapper (Master Plan Phase 4).
 *
 * Pure transform: a finished Clone & Crush "Chain-Loop" workflow session is
 * converted into a TubeBot (ChatAgent) seed — a topic to prefill, an optional
 * `context` block passed to /api/generate-text so the model builds on the
 * Chain-Loop intel, and a short human-readable summary for the handoff banner.
 *
 * Kept pure (no React, no store writes) so it is trivially unit-testable.
 */
import type { CreatorWorkflowSession } from "@/stores/useWorkflowStore";

export interface TubeBotSeed {
  /** Best-effort topic string for the input field. */
  topic: string;
  /** Structured intel block forwarded to the server's optional `context`. */
  context: string;
  /** One-line, UI-ready description of what arrived. */
  summary: string;
  /** Provenance fields surfaced in the handoff banner. */
  niche: string | undefined;
  competitorTitle: string | undefined;
  rewriteTitle: string | undefined;
  scriptChars: number;
  tagCount: number;
}

/**
 * Build a TubeBot seed from a workflow session. Returns null when there is
 * nothing actionable (no niche and no content package).
 */
export function buildTubeBotSeed(workflow: CreatorWorkflowSession | null | undefined): TubeBotSeed | null {
  if (!workflow) return null;

  const niche = workflow.niche?.trim() || undefined;
  const competitorTitle = workflow.competitor?.title?.trim() || undefined;
  const pkg = workflow.contentPackage;
  const rewriteTitle = pkg?.title?.trim() || undefined;

  // Topic: niche is broadest (lets TubeBot generate fresh angles); fall back to
  // the rewritten title, then the competitor title.
  const topic = niche || rewriteTitle || competitorTitle || "";
  if (!topic) return null;

  const scriptChars = typeof pkg?.fullScript === "string" ? pkg.fullScript.trim().length : 0;
  const tags = Array.isArray(pkg?.seoTags) ? pkg.seoTags.filter((t): t is string => typeof t === "string" && t.trim().length > 0) : [];
  const tagCount = tags.length;

  // Assemble the context block the model will build on.
  const lines: string[] = [];
  if (niche) lines.push(`NICHE: ${niche}`);
  if (competitorTitle) lines.push(`REFERENCE VIDEO: ${competitorTitle}`);
  if (rewriteTitle) lines.push(`WORKING TITLE: ${rewriteTitle}`);
  if (scriptChars > 0 && pkg?.fullScript) {
    // Cap the script carried as context to keep the payload reasonable.
    lines.push(`SCRIPT FOUNDATION:\n${pkg.fullScript.trim().slice(0, 2500)}`);
  }
  if (tagCount > 0) lines.push(`SEO TAGS: ${tags.join(", ")}`);
  const context = lines.join("\n");

  // Human summary for the banner.
  const summaryParts: string[] = [];
  if (niche) summaryParts.push(niche);
  if (rewriteTitle) summaryParts.push(`"${truncate(rewriteTitle, 48)}"`);
  const summary =
    summaryParts.length > 0
      ? `${summaryParts.join(" • ")}${scriptChars > 0 ? ` • ${Math.round(scriptChars / 1000)}k-char script` : ""}${tagCount > 0 ? ` • ${tagCount} tags` : ""}`
      : topic;

  return { topic, context, summary, niche, competitorTitle, rewriteTitle, scriptChars, tagCount };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
