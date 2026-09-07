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
      signal: AbortSignal.timeout(ENGINE_FETCH_TIMEOUT_MS),
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
