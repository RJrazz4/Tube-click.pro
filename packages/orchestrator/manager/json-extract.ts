/**
 * Phase B2/B4 — tolerant JSON extraction from LLM output.
 *
 * Even in JSON mode some backends wrap output in ```json fences or leak a
 * line of prose. We extract the outermost balanced-looking object span
 * (first "{" → last "}") after preferring a fenced block when one exists.
 * Returns null when no object span is present.
 */
export function extractJsonObject(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(raw);
  const text = fenced ? fenced[1] : raw;

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}
