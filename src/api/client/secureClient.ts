/**
 * TubeGenius Pro — Secure Edge Function Client
 * Phase A1/A3: No client-side API keys. All keys live in Deno.env / process.env on server.
 * Front-end only sends anon Supabase key for auth to edge function gateway.
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

const RETRY_DELAYS = [2000, 5000, 10000];
const lastCall = new Map<string, number>();
const MIN_INTERVAL = 1200; // throttle to protect server quotas

export async function fetchEdgeFunctionJson<T>(functionName: string, body: unknown, signal?: AbortSignal): Promise<T> {
  // Throttle
  const now = Date.now();
  const prev = lastCall.get(functionName) || 0;
  const elapsed = now - prev;
  if (elapsed < MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL - elapsed));
  }
  lastCall.set(functionName, Date.now());

  let lastErr: EdgeFunctionError | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const base = RETRY_DELAYS[attempt - 1];
      const jitter = base * 0.2 * (Math.random() * 2 - 1);
      await new Promise(r => setTimeout(r, Math.round(base + jitter)));
    }

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body), // NO customApiKey here — server uses Deno.env only
      signal,
    });

    const parsed = await readResponseBody(res);

    if (res.ok) {
      if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error) {
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

/**
 * For audio binary responses (elevenlabs-tts) — returns Blob
 */
export async function fetchEdgeFunctionBlob(functionName: string, body: unknown, signal?: AbortSignal): Promise<Blob> {
  const now = Date.now();
  const prev = lastCall.get(functionName) || 0;
  const elapsed = now - prev;
  if (elapsed < MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL - elapsed));
  }
  lastCall.set(functionName, Date.now());

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
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
