/**
 * TubeClick Pro — Secure Edge Function Client
 * Phase A3: Secure Environment Setup — No client-side API keys.
 * All keys live in Deno.env (Supabase) or process.env (Vercel Edge) on server.
 * 
 * Supports dual routing:
 * - Supabase Edge Functions: VITE_SUPABASE_URL/functions/v1/<name> (default)
 * - Vercel Edge Functions: /api/<vercel-route> (if VITE_USE_VERCEL_EDGE=true)
 * 
 * Client only sends anon Supabase key for auth — never sends provider keys.
 * Vercel Edge functions are faster for US audience (edge caching, <50ms cold start)
 */

import { supabase } from "@/integrations/supabase/client";

export class EdgeFunctionError extends Error {
  status: number;
  /** Phase E1/E2 machine-readable code (QUOTA_EXCEEDED_DAILY, RATE_LIMITED, ...) */
  code?: string;
  /** Seconds the provider asked us to wait before retrying */
  retryAfter?: number;
  /** Optional next-step guidance from the server */
  action?: string;
  constructor(message: string, status: number, opts?: { code?: string; retryAfter?: number; action?: string }) {
    super(message);
    this.name = "EdgeFunctionError";
    this.status = status;
    this.code = opts?.code;
    this.retryAfter = opts?.retryAfter;
    this.action = opts?.action;
  }
}

/** Extract normalized Phase E1/E2 envelope metadata, if present */
function errorMeta(parsed: unknown): { code?: string; retryAfter?: number; action?: string } {
  const p: any = parsed && typeof parsed === "object" ? parsed : {};
  return {
    code: typeof p.code === "string" ? p.code : undefined,
    retryAfter: typeof p.retryAfter === "number" ? p.retryAfter : undefined,
    action: typeof p.action === "string" ? p.action : undefined,
  };
}

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof (body as any).error === "string") {
    return (body as any).error;
  }
  return `Request failed with status ${status}`;
}

// Map Supabase function names -> Vercel Edge routes
const VERCEL_ROUTE_MAP: Record<string, string> = {
  "generate-content": "/api/generate-text",
  "generate-seo": "/api/seo-tags",
  "seo-tags": "/api/seo-tags",
  "generate-thumbnail": "/api/generate-thumbnail",
  "generate-storyboard-image": "/api/generate-storyboard-image",
  "analyze-storyboard": "/api/analyze-storyboard",
  "elevenlabs-tts": "/api/elevenlabs-tts",
  "vectorengine-tts": "/api/vectorengine-tts",
  "vision-guide": "/api/vision-guide",
  "transcript": "/api/transcript",
  "clone-crush": "/api/clone-crush",
  // Phase 4 — V1 API routes
  "v1/storyboard": "/api/v1/storyboard",
  "v1/thumbnail": "/api/v1/thumbnail",
};

function getApiEndpoint(functionName: string): { url: string; headers: Record<string, string>; isVercel: boolean } {
  // Clone & Crush has no Supabase Edge implementation. Routing it through the
  // generic default can hit a stale, separately deployed function (including
  // historical mock-profile behavior) instead of api/clone-crush.ts. Keep this
  // route pinned to Vercel, where YOUTUBE_API_KEY is the only data source.
  const useVercelEdge = functionName === "clone-crush"
    || import.meta.env.VITE_USE_VERCEL_EDGE === "true"
    || import.meta.env.VITE_API_MODE === "vercel";

  if (useVercelEdge) {
    const vercelRoute = VERCEL_ROUTE_MAP[functionName] || `/api/${functionName}`;
    return {
      url: vercelRoute,
      headers: {
        "Content-Type": "application/json",
        // No need for apikey on Vercel — auth handled via middleware / cookies
      },
      isVercel: true,
    };
  }

  // Default: Supabase Edge
  return {
    url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    isVercel: false,
  };
}

const RETRY_DELAYS = [2000, 5000, 10000];
const lastCall = new Map<string, number>();
const MIN_INTERVAL = 1200;

export async function fetchEdgeFunctionJson<T>(functionName: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const now = Date.now();
  const prev = lastCall.get(functionName) || 0;
  const elapsed = now - prev;
  if (elapsed < MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL - elapsed));
  }
  lastCall.set(functionName, Date.now());

  const { url, headers: baseHeaders, isVercel } = getApiEndpoint(functionName);
  const headers = { ...baseHeaders };
  // Vercel routes do not receive Supabase's browser session automatically.
  // Forward only the short-lived access token so protected server features can
  // verify entitlements without trusting a client-supplied plan value.
  if (isVercel) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  let lastErr: EdgeFunctionError | null = null;
  let pendingDelayMs: number | null = null; // Phase E2: provider-hinted delay wins

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const base = pendingDelayMs ?? RETRY_DELAYS[attempt - 1];
      pendingDelayMs = null;
      // Non-negative jitter only — a provider retryDelay is a minimum, never go below it
      const jitter = base * 0.2 * Math.random();
      await new Promise(r => setTimeout(r, Math.round(base + jitter)));
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body), // NO customApiKey — server uses env only
      signal,
    });

    const parsed = await readResponseBody(res);

    if (res.ok) {
      if (parsed && typeof parsed === "object" && "error" in parsed && (parsed as any).error) {
        throw new EdgeFunctionError(String((parsed as any).error), res.status || 500, errorMeta(parsed));
      }
      return parsed as T;
    }

    const msg = extractMessage(parsed, res.status);
    lastErr = new EdgeFunctionError(msg, res.status, errorMeta(parsed));

    if (res.status === 401 || res.status === 403) throw lastErr;

    // Phase E2 — normalized server envelope (has `code`): the server already
    // applied model failover + policy-driven retries. Only honor an explicit
    // provider retryAfter hint — exactly once — and fail fast on everything
    // else (e.g. QUOTA_EXCEEDED_DAILY must NEVER be retried client-side).
    const code = (parsed as any)?.code;
    if (typeof code === 'string') {
      if (typeof lastErr.retryAfter === 'number' && lastErr.retryAfter > 0 && attempt === 0) {
        pendingDelayMs = Math.min(lastErr.retryAfter, 30) * 1000;
        continue;
      }
      throw lastErr;
    }

    // Legacy backends (Supabase functions) without a machine-readable code
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === RETRY_DELAYS.length) throw lastErr;
  }

  throw lastErr || new EdgeFunctionError("Request failed after retries", 500);
}

export async function fetchEdgeFunctionBlob(functionName: string, body: unknown, signal?: AbortSignal): Promise<Blob> {
  const now = Date.now();
  const prev = lastCall.get(functionName) || 0;
  const elapsed = now - prev;
  if (elapsed < MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL - elapsed));
  }
  lastCall.set(functionName, Date.now());

  const { url, headers: baseHeaders, isVercel } = getApiEndpoint(functionName);
  const headers = { ...baseHeaders };
  if (isVercel) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const parsed = await readResponseBody(res);
    const msg = extractMessage(parsed, res.status);
    throw new EdgeFunctionError(msg, res.status, errorMeta(parsed));
  }

  return await res.blob();
}

// Config fetcher — public, no secrets
export async function fetchPublicConfig(): Promise<{ lockerUrl: string; features: any; tiers: any }> {
  const useVercel = import.meta.env.VITE_USE_VERCEL_EDGE === "true";
  const url = useVercel ? "/api/config" : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/config`;

  try {
    const res = await fetch(url, { method: useVercel ? "GET" : "POST" });
    if (!res.ok) throw new Error("Config fetch failed");
    return await res.json();
  } catch {
    // Fallback to local locker config
    return {
      lockerUrl: localStorage.getItem("tubegenius_locker_config") ? JSON.parse(localStorage.getItem("tubegenius_locker_config")!).locker_url : "",
      features: {},
      tiers: { free: {}, pro: {} },
    };
  }
}
