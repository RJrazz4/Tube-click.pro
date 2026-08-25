import { supabase } from "@/integrations/supabase/client";

/**
 * Engine API client (tubeclickpro-backend-engine on Render).
 * Bearer = the user's Supabase access token; one automatic retry after a
 * session refresh on 401. Mirrors the CryptoCheckout auth pattern.
 */

export const ENGINE_URL = (import.meta.env.VITE_ENGINE_URL as string | undefined ?? "").replace(/\/$/, "");

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

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    throw new EngineError(401, "NOT_AUTHENTICATED", "Sign in to use the intelligence engine");
  }
  return data.session.access_token;
}

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

  const doFetch = async (): Promise<Response> =>
    fetch(`${ENGINE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let response = await doFetch();
  if (response.status === 401 && !options.anonymous) {
    await supabase.auth.refreshSession();
    response = await doFetch();
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
