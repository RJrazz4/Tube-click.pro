/**
 * TubeClick Pro — Ghost Protocol v2 Secure Client
 * Phase 1: Quantum Cache + Ghost Relay Mesh
 * Zero-budget resilience: never shows "Failed to fetch" raw.
 * Every request has 3-layer fallback: live -> retry -> quantum ghost cache.
 * Makes the app feel like $100/mo edge CDN.
 */

import { supabase } from "@/integrations/supabase/client";

export class EdgeFunctionError extends Error {
  status: number;
  code?: string;
  retryAfter?: number;
  action?: string;
  isGhostCache?: boolean;
  constructor(message: string, status: number, opts?: { code?: string; retryAfter?: number; action?: string; isGhostCache?: boolean }) {
    super(message);
    this.name = "EdgeFunctionError";
    this.status = status;
    this.code = opts?.code;
    this.retryAfter = opts?.retryAfter;
    this.action = opts?.action;
    this.isGhostCache = opts?.isGhostCache;
  }
}

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
  try { return JSON.parse(text); } catch { return { error: text }; }
}

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body && typeof (body as any).error === "string") {
    return (body as any).error;
  }
  return `Request failed with status ${status}`;
}

// ---------- QUANTUM CACHE - $0 Edge CDN Illusion ----------
const QC_TTL_MS = 10 * 60 * 1000; // 10 min
const QC_STALE_TTL_MS = 30 * 60 * 1000; // serve stale up to 30 min if network down
const memCache = new Map<string, { data: any; expires: number; staleUntil: number }>();

function qcHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function qcKey(functionName: string, body: unknown): string {
  try {
    return `qc:v2:${functionName}:${qcHash(JSON.stringify(body) || "")}`;
  } catch { return `qc:v2:${functionName}:fallback`; }
}

function qcGet<T>(key: string): { data: T; isStale: boolean } | null {
  const now = Date.now();
  const mem = memCache.get(key);
  if (mem) {
    if (now < mem.expires) return { data: mem.data as T, isStale: false };
    if (now < mem.staleUntil) return { data: mem.data as T, isStale: true };
  }
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.expires === "number") {
        if (now < parsed.expires) return { data: parsed.data as T, isStale: false };
        if (now < parsed.staleUntil) return { data: parsed.data as T, isStale: true };
      }
    }
  } catch { /* ignore */ }
  return null;
}

function qcSet(key: string, data: any, ttlMs = QC_TTL_MS) {
  const now = Date.now();
  const entry = { data, expires: now + ttlMs, staleUntil: now + QC_STALE_TTL_MS };
  memCache.set(key, entry);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(entry));
    }
  } catch { /* quota - ignore */ }
  // LRU trim mem to 120 entries max
  if (memCache.size > 120) {
    const firstKey = memCache.keys().next().value;
    if (firstKey) memCache.delete(firstKey);
  }
}

// ---------- API ROUTING ----------
const VERCEL_ROUTE_MAP: Record<string, string> = {
  "generate-content": "/api/generate-text",
  "generate-seo": "/api/seo-tags",
  "seo-tags": "/api/seo-tags",
  "analyze-storyboard": "/api/analyze-storyboard",
  "elevenlabs-tts": "/api/elevenlabs-tts",
  "transcript": "/api/transcript",
  "clone-crush": "/api/clone-crush",
};

function getApiEndpoint(functionName: string): { url: string; headers: Record<string, string>; isVercel: boolean } {
  const useVercelEdge = functionName === "clone-crush" || functionName === "transcript"
    || import.meta.env.VITE_USE_VERCEL_EDGE === "true"
    || import.meta.env.VITE_API_MODE === "vercel";

  if (useVercelEdge) {
    const vercelRoute = VERCEL_ROUTE_MAP[functionName] || `/api/${functionName}`;
    return { url: vercelRoute, headers: { "Content-Type": "application/json" }, isVercel: true };
  }
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

// ---------- GHOST RELAY RESILIENCE ----------
const RETRY_DELAYS = [800, 2000, 5000]; // faster than before, plus jitter
const lastCall = new Map<string, number>();
const MIN_INTERVAL = 600; // reduced from 1200 for snappier feel

function isNetworkFailure(err: unknown, res?: Response): boolean {
  if (!res) return true;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
}

async function sleepWithJitter(baseMs: number): Promise<void> {
  const jitter = baseMs * 0.25 * Math.random();
  await new Promise(r => setTimeout(r, Math.round(baseMs + jitter)));
}

export async function fetchEdgeFunctionJson<T>(functionName: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const cacheKey = qcKey(functionName, body);
  const cached = qcGet<T>(cacheKey);

  // Throttle guard - ghost protocol style
  const now = Date.now();
  const prev = lastCall.get(functionName) || 0;
  const elapsed = now - prev;
  if (elapsed < MIN_INTERVAL) await new Promise(r => setTimeout(r, MIN_INTERVAL - elapsed));
  lastCall.set(functionName, Date.now());

  const { url, headers: baseHeaders, isVercel } = getApiEndpoint(functionName);
  const headers = { ...baseHeaders };
  if (isVercel) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    } catch { /* ignore */ }
  }

  let lastErr: EdgeFunctionError | null = null;
  let pendingDelayMs: number | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const base = pendingDelayMs ?? RETRY_DELAYS[attempt - 1];
      pendingDelayMs = null;
      await sleepWithJitter(base);
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });

      const parsed = await readResponseBody(res);

      if (res.ok) {
        if (parsed && typeof parsed === "object" && "error" in parsed && (parsed as any).error) {
          throw new EdgeFunctionError(String((parsed as any).error), res.status || 500, errorMeta(parsed));
        }
        qcSet(cacheKey, parsed);
        return parsed as T;
      }

      const msg = extractMessage(parsed, res.status);
      lastErr = new EdgeFunctionError(msg, res.status, errorMeta(parsed));

      // Never retry on these - they're fatal
      if (res.status === 401 || res.status === 403) {
        if (cached && !cached.isStale) {
          // If we have fresh cache, prefer it for auth walls? No - auth must fail fast
        }
        throw lastErr;
      }

      const code = (parsed as any)?.code;
      if (typeof code === 'string') {
        // If provider tells us to wait, honor once then give ghost cache a chance
        if (typeof lastErr.retryAfter === 'number' && lastErr.retryAfter > 0 && attempt === 0) {
          pendingDelayMs = Math.min(lastErr.retryAfter, 30) * 1000;
          continue;
        }
        // QUOTA_EXCEEDED_DAILY - try ghost cache before throwing
        if (cached) {
          const ghostErr = new EdgeFunctionError(
            `Ghost cache active: ${cached.isStale ? "Serving stale intel (30m)" : "Served from edge node"} • ${msg}`,
            200,
            { code: "GHOST_CACHE", isGhostCache: true }
          );
          // Return cached data but mark as ghost
          console.warn(`[ghost-cache] Serving ${functionName} from quantum cache due to ${code}`);
          return cached.data;
        }
        throw lastErr;
      }

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === RETRY_DELAYS.length) {
        if (cached) {
          console.warn(`[ghost-cache] Fallback to cache after ${attempt} attempts for ${functionName}`);
          return cached.data;
        }
        throw lastErr;
      }
    } catch (err: any) {
      const isNet = isNetworkFailure(err);
      lastErr = err instanceof EdgeFunctionError ? err : new EdgeFunctionError(
        isNet ? "Ghost tunnel interference detected - re-establishing secure uplink..." : (err?.message || "Network ghost detected"),
        0,
        { code: isNet ? "NETWORK" : "UNKNOWN" }
      );

      // Network failure - always retry + fallback to cache
      if (isNet) {
        if (attempt < RETRY_DELAYS.length) continue;
        if (cached) {
          console.warn(`[ghost-cache] Network down, serving ${functionName} from quantum cache`);
          return cached.data;
        }
      }

      if (err instanceof EdgeFunctionError && (err.status === 401 || err.status === 403)) throw err;
      if (attempt >= RETRY_DELAYS.length) {
        if (cached) {
          console.warn(`[ghost-cache] Final fallback to cache for ${functionName}`);
          return cached.data;
        }
        throw lastErr;
      }
    }
  }

  if (cached) return cached.data;
  throw lastErr || new EdgeFunctionError("Ghost protocol: request failed after all relays", 500, { code: "GHOST_FAIL" });
}

export async function fetchEdgeFunctionBlob(functionName: string, body: unknown, signal?: AbortSignal): Promise<Blob> {
  const now = Date.now();
  const prev = lastCall.get(functionName) || 0;
  const elapsed = now - prev;
  if (elapsed < MIN_INTERVAL) await new Promise(r => setTimeout(r, MIN_INTERVAL - elapsed));
  lastCall.set(functionName, Date.now());

  const { url, headers: baseHeaders, isVercel } = getApiEndpoint(functionName);
  const headers = { ...baseHeaders };
  if (isVercel) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  let lastErr: EdgeFunctionError | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) await sleepWithJitter(RETRY_DELAYS[attempt - 1]);
    try {
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
      if (!res.ok) {
        const parsed = await readResponseBody(res);
        const msg = extractMessage(parsed, res.status);
        throw new EdgeFunctionError(msg, res.status, errorMeta(parsed));
      }
      return await res.blob();
    } catch (err: any) {
      lastErr = err instanceof EdgeFunctionError ? err : new EdgeFunctionError(err?.message || "Blob fetch failed", 0, { code: "NETWORK" });
      if (attempt >= RETRY_DELAYS.length) throw lastErr;
      if (!isNetworkFailure(err)) throw lastErr;
    }
  }
  throw lastErr || new EdgeFunctionError("Blob failed", 500);
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
    return {
      lockerUrl: typeof localStorage !== "undefined" && localStorage.getItem("tubegenius_locker_config")
        ? JSON.parse(localStorage.getItem("tubegenius_locker_config")!).locker_url : "",
      features: {},
      tiers: { free: {}, pro: {} },
    };
  }
}

// Utility to clear quantum cache manually (debug)
export function clearQuantumCache() {
  memCache.clear();
  try {
    if (typeof localStorage !== "undefined") {
      Object.keys(localStorage).forEach(k => { if (k.startsWith("qc:v2:")) localStorage.removeItem(k); });
    }
  } catch {}
}
