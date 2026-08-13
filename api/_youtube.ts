/**
 * api/_youtube.ts — YouTube ghost-mesh helpers.
 *
 * Thin, Edge-friendly utilities over the Piped public API relay mesh
 * (same topology used by api/transcript.ts) for data the Data API v3
 * either charges too much for or quota-blocks on free tiers:
 *
 *   - fetchTopComments(videoId) — up to ~15 top-level comment bodies
 *     from the first responding Piped node, with a strict 2.4s
 *     "first-valid" deadline. Returns [].length===0 on any failure so
 *     callers can degrade gracefully.
 *
 * All helpers degrade to EMPTY arrays on failure — they are best-effort
 * intel inputs, never hard dependencies. Callers (Squad engine) treat
 * empty comments as "no comment intel" rather than as an error.
 */

export const PIPED_COMMENT_NODES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.private.coffee",
  "https://pipedapi.colby.rocks",
  "https://pipedapi.mha.fi",
  "https://pipedapi.syncpnd.com",
  "https://api.piped.projectsegfau.lt",
];

export interface YtComment {
  author: string;
  text: string;
  likeCount: number;
  /** Piped comment id, if surfaced. */
  id?: string;
}

/**
 * firstValid — returns the first non-null resolution from a racing list
 * of promises, or null if all reject/timeout. Mirrors transcript.ts.
 */
async function firstValid<T>(promises: Array<Promise<T | null>>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = 0;
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; resolve(null); }
    }, timeoutMs);
    promises.forEach((p) => {
      p.then((v) => {
        if (!done && v) { done = true; clearTimeout(timer); resolve(v); }
      }).catch(() => {}).finally(() => {
        settled++;
        if (!done && settled === promises.length) { done = true; clearTimeout(timer); resolve(null); }
      });
    });
  });
}

function clampText(s: unknown, max = 240): string {
  if (typeof s !== "string") return "";
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}

function normalizePipedComments(raw: any): YtComment[] {
  // Piped returns { comments: [ { author, commentText, likeCount, commentId } ] }
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.comments) ? raw.comments : []);
  const out: YtComment[] = [];
  for (const c of arr) {
    if (!c || typeof c !== "object") continue;
    const text = clampText(c.commentText || c.text || c.body, 280);
    if (!text) continue;
    const likes = typeof c.likeCount === "number" ? c.likeCount
      : (typeof c.likes === "number" ? c.likes : parseInt(String(c.likeCount || "0"), 10) || 0);
    out.push({
      author: clampText(c.author || c.authorName || "viewer", 60) || "viewer",
      text,
      likeCount: Number.isFinite(likes) ? likes : 0,
      id: typeof c.commentId === "string" ? c.commentId : (typeof c.id === "string" ? c.id : undefined),
    });
    if (out.length >= 15) break;
  }
  // Sort by likes desc so the top signals come first even if a node
  // returns them unsorted.
  out.sort((a, b) => b.likeCount - a.likeCount);
  return out.slice(0, 12);
}

async function fetchCommentsFromNode(base: string, videoId: string): Promise<YtComment[] | null> {
  const url = `${base}/comments/${encodeURIComponent(videoId)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TubeClickPro/2.0 Ghost Squad" },
      signal: AbortSignal.timeout(1800),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    const comments = normalizePipedComments(data);
    return comments.length > 0 ? comments : null;
  } catch {
    return null;
  }
}

/**
 * Fetch top comments for a YouTube video via the Piped mesh. Returns
 * [] on any failure so Squad can continue without comment intel.
 */
export async function fetchTopComments(videoId: string): Promise<YtComment[]> {
  if (!videoId || typeof videoId !== "string" || videoId.length !== 11) return [];
  const winner = await firstValid<YtComment[]>(
    PIPED_COMMENT_NODES.map((base) => fetchCommentsFromNode(base, videoId)),
    2400,
  );
  return winner ?? [];
}

/**
 * Extract an 11-character YouTube video id from a URL or bare id.
 * Returns null on invalid input.
 */
export function extractVideoId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const v = u.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  } catch { /* noop */ }
  return null;
}
