/**
 * Phase G4 — Loading-state view helpers: elapsed-time labels.
 *
 * Pure, trivially testable; the GenerationProgress component renders an
 * honest ticking clock so long generations never feel frozen.
 */

/** "0s" … "59s" → "1m 00s" … — clamped, floored, never negative. */
export function formatElapsedSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  if (clamped < 60) return `${clamped}s`;
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
