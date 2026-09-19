/**
 * Directorial-cue parser for LSA-generated scripts.
 *
 * The "Limbic System Architect" backend emits micro-pacing cues inline inside
 * the spoken text, wrapped in [square brackets] — e.g. "[voice drops to a raw,
 * breathless whisper]". This splits a script string into text + cue segments so
 * the UI can render cues with a distinct, premium treatment.
 *
 * Deliberately conservative to avoid false positives:
 *  - markdown links  "[label](url)"      → left as text (bracket followed by "(")
 *  - timestamps      "[00:42]" / "[1:02]" → left as text
 *  - empty / oversized brackets          → left as text
 */

export type ScriptSegment = { type: "cue"; value: string } | { type: "text"; value: string };

const CUE_RE = /\[([^\[\]\n]{2,140})\]/g;
const TIMESTAMP_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;

export function parseScriptCues(input: string): ScriptSegment[] {
  if (!input) return [];
  const segments: ScriptSegment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  CUE_RE.lastIndex = 0;
  while ((match = CUE_RE.exec(input)) !== null) {
    const inner = match[1];
    const charAfter = input[match.index + match[0].length];
    const isLink = charAfter === "(";
    const isTimestamp = TIMESTAMP_RE.test(inner.trim());

    if (isLink || isTimestamp) continue; // leave as plain text (handled by the trailing slice)

    if (match.index > last) segments.push({ type: "text", value: input.slice(last, match.index) });
    segments.push({ type: "cue", value: inner });
    last = match.index + match[0].length;
  }

  if (last < input.length) segments.push({ type: "text", value: input.slice(last) });
  return segments;
}

/** True when a string contains at least one renderable directorial cue. */
export function hasScriptCues(input: string): boolean {
  return parseScriptCues(input).some((s) => s.type === "cue");
}
