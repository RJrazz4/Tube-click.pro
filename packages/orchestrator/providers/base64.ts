/**
 * Phase C1/C2 — runtime-portable base64 (Edge-safe, Node-safe).
 *
 * Edge runtimes have btoa but no Buffer; Node has both. Chunked to stay
 * within argument-spreading limits on large image payloads.
 */

export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${toBase64(bytes)}`;
}
