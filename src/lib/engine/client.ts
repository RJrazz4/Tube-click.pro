import { getValidAccessToken } from "@/lib/auth/accessToken";

/**
 * Engine API client (tubeclickpro-backend-engine on Render).
 * Bearer = the user's Supabase access token. Tokens are resolved through
 * getValidAccessToken() (which auto-refreshes a missing/near-expiry session)
 * and one automatic retry happens after a session refresh on 401.
 */

import { normalizeBaseUrl } from "./url";

// Accept either alias so the engine is reachable whichever one is set in Vercel.
// normalizeBaseUrl also strips stray whitespace/quotes (a deployed build once
// shipped "https://tubeclickpro- backend-engine.onrender.com" with a space).
export const ENGINE_URL = normalizeBaseUrl(
  (import.meta.env.VITE_ENGINE_URL as string | undefined) ||
    (import.meta.env.VITE_BACKEND_ENGINE_URL as string | undefined) ||
    "",
);

export class EngineError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export function engineConfigured(): boolean {
  return ENGINE_URL.length > 0;
}

async function accessToken(forceRefresh = false): Promise<string> {
  const token = await getValidAccessToken({ forceRefresh });
  if (!token) {
    throw new EngineError(401, "NOT_AUTHENTICATED", "Sign in to use the intelligence engine. Your session may have expired.");
  }
  return token;
}

// Per-request hard timeout. A hung engine (Render cold start, network stall)
// must never leave a React Query observer spinning in `isLoading` forever —
// it would render an endless "Loading audience intelligence…" card.
const ENGINE_FETCH_TIMEOUT_MS = 25_000;

interface EngineFetchOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  /** Skip auth (not currently needed by any engine route). */
  anonymous?: boolean;
  /** Response is raw binary (voiceover MP3). */
  raw?: boolean;
  /**
   * Per-request hard timeout override (ms). Needed for routes that can hit a
   * cold Render free instance (30–60s spin-up) — e.g. the clipper enqueue.
   */
  timeoutMs?: number;
}

export async function engineFetch<T>(path: string, options: EngineFetchOptions = {}): Promise<T> {
  if (!engineConfigured()) {
    throw new EngineError(503, "ENGINE_NOT_CONFIGURED", "Intelligence engine is not configured for this deployment");
  }
  const token = options.anonymous ? null : await accessToken();

  const doFetch = async (forceRefresh: boolean): Promise<Response> => {
    const bearer = options.anonymous ? null : await accessToken(forceRefresh);
    return fetch(`${ENGINE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? ENGINE_FETCH_TIMEOUT_MS),
    });
  };

  let response = await doFetch(false);
  if (response.status === 401 && !options.anonymous) {
    // Mint a fresh token (getValidAccessToken({forceRefresh}) already refreshes
    // the session) and retry once before giving up.
    response = await doFetch(true);
  }

  if (options.raw) {
    if (!response.ok) throw new EngineError(response.status, "ENGINE_HTTP_ERROR", `Engine request failed (${response.status})`);
    return (await response.blob()) as unknown as T;
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const err = (payload.error ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new EngineError(response.status, err.code ?? "ENGINE_ERROR", err.message ?? `Engine request failed (${response.status})`, err.details);
  }
  return payload as T;
}

/** Kick off the OAuth dance: engine returns the Google consent URL. */
export async function connectYouTubeUrl(): Promise<string> {
  const { authUrl } = await engineFetch<{ authUrl: string }>("/api/youtube/auth-url");
  return authUrl;
}

// ── Trend Radar (zero-cost, keyless YouTube intelligence) ──────────────
export interface TrendItem {
  videoId: string;
  title: string;
  channel: string;
  views: number | null;
  thumbnail: string | null;
  url: string;
  source: string;
}
export interface TrendRadar {
  generatedAt: string;
  topic: string | null;
  count: number;
  items: TrendItem[];
}

/** Live trending videos, or topic search when `topic` is provided. */
export function fetchTrendRadar(topic?: string): Promise<TrendRadar> {
  const q = topic?.trim() ? `?topic=${encodeURIComponent(topic.trim())}` : "";
  return engineFetch<TrendRadar>(`/api/trends${q}`);
}

// ── Zero-Cost Viral Shorts Clipper ───────────────────────────────────────
export interface ClipEnqueueResult {
  status: "queued" | "deduped";
  jobId: string;
  videoId: string;
  window: { autoSelect: boolean; startSeconds: number; durationSeconds: number };
  quota: { used: number; limit: number };
}

export interface ClipSelection {
  startSeconds: number;
  durationSeconds: number;
  reason: string;
  peakType: string;
}

export interface ClipStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  stage?: string;
  url?: string;
  error?: string;
  selection?: ClipSelection;
  createdAt: string;
  updatedAt: string;
}

export interface ClipRequestInput {
  url: string;
  durationSeconds?: number;
  captionStyle?: "karaoke" | "bold" | "minimal";
  autoSelect?: boolean;
}

/** Enqueue a clip render. Returns immediately (202) — poll getClip for status. */
export function requestClip(input: ClipRequestInput): Promise<ClipEnqueueResult> {
  // 90s: the enqueue itself is instant, but a cold Render free instance can take
  // 30–60s to spin up. Aborting at the default 25s caused "signal timed out"
  // before the job was ever queued.
  return engineFetch<ClipEnqueueResult>("/api/clips", { method: "POST", body: input, timeoutMs: 90_000 });
}

/** Poll a clip job's status/result. */
export function getClip(jobId: string): Promise<ClipStatus> {
  return engineFetch<ClipStatus>(`/api/clips/${encodeURIComponent(jobId)}`, { timeoutMs: 30_000 });
}
