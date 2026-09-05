/**
 * Normalise a base-URL string read from the environment.
 *
 * The deployed bundle once shipped with `VITE_ENGINE_URL` containing an
 * embedded space ("https://tubeclickpro- backend-engine.onrender.com"), which
 * made every `fetch` to the backend fail and the UI fall into its locked
 * state. Environment values are pasted by humans and can carry stray
 * whitespace or quotes; strip them so the connection is resilient.
 */
export function normalizeBaseUrl(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^["']|["']$/g, "") // drop accidental surrounding quotes
    .replace(/\s+/g, "") // drop embedded whitespace/newlines
    .replace(/\/+$/, ""); // drop trailing slashes
}
