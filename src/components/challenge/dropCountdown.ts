/** Pure countdown text (unit-tested via dropCountdownText). */
export function dropCountdownText(targetIso: string, now = new Date()): string {
  const diff = Date.parse(targetIso) - now.getTime();
  if (diff <= 0) return "READY";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
}
