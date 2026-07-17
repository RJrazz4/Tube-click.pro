/**
 * Shared helpers for Vercel Edge Functions — secure, server-only keys
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Safely parse JSON body — returns { data, error? } — check error before using data */
export async function safeJsonBody(req: Request): Promise<{ data: any; error?: string }> {
  try {
    const data = await req.json();
    return { data };
  } catch (e: any) {
    return { data: null, error: `Invalid JSON body: ${e.message || 'parse error'}` };
  }
}

/** Create an AbortController with timeout (ms) — use for external API calls */
export function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

/** Classify fetch errors into user-friendly messages */
export function classifyFetchError(e: unknown, service: string): string {
  if (e instanceof DOMException && e.name === 'AbortError') return `${service} request timed out`;
  if (e instanceof TypeError && e.message?.includes('fetch')) return `${service} network error`;
  return `${service} error: ${(e as any)?.message || 'unknown'}`;
}

export function requireEnv(key: string): string {
  const val = process.env[key] || "";
  if (!val) throw new Error(`${key} not configured on server. Set in Vercel dashboard or via supabase secrets set ${key}=...`);
  return val;
}

// GEMINI model constant
export const GEMINI_MODEL = "gemini-2.0-flash";
export const RETRY_DELAYS = [2000, 5000, 10000];

export function extractGeminiText(data: any) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("\n")
    .trim();
}

export async function fetchGeminiWithRetry(url: string, body: unknown): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1];
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      await new Promise(r => setTimeout(r, Math.round(delay + jitter)));
    }
    last = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (last.ok || (last.status < 500 && last.status !== 429)) return last;
    if (attempt === RETRY_DELAYS.length) return last;
  }
  return last!;
}

export function cleanupJson(value: string) {
  return value.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
}
