/**
 * TubeGenius Pro — Secure Edge Function Client
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

export class EdgeFunctionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "EdgeFunctionError";
    this.status = status;
  }
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
  "vision-guide": "/api/vision-guide",
  "transcript": "/api/transcript",
};

function getApiEndpoint(functionName: string): { url: string; headers: Record<string, string>; isVercel: boolean } {
  const useVercelEdge = import.meta.env.VITE_USE_VERCEL_EDGE === "true" || import.meta.env.VITE_API_MODE === "vercel";

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

  const { url, headers } = getApiEndpoint(functionName);

  let lastErr: EdgeFunctionError | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const base = RETRY_DELAYS[attempt - 1];
      const jitter = base * 0.2 * (Math.random() * 2 - 1);
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
        throw new EdgeFunctionError(String((parsed as any).error), res.status || 500);
      }
      return parsed as T;
    }

    const msg = extractMessage(parsed, res.status);
    lastErr = new EdgeFunctionError(msg, res.status);

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === RETRY_DELAYS.length) throw lastErr;
    if (res.status === 401 || res.status === 403) throw lastErr;
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

  const { url, headers } = getApiEndpoint(functionName);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const parsed = await readResponseBody(res);
    const msg = extractMessage(parsed, res.status);
    throw new EdgeFunctionError(msg, res.status);
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
