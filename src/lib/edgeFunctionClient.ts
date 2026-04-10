export class EdgeFunctionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EdgeFunctionError";
    this.status = status;
  }
}

async function readResponseBody(response: Response) {
  const responseText = await response.text();

  if (!responseText) return null;

  try {
    return JSON.parse(responseText);
  } catch {
    return { error: responseText };
  }
}

function extractErrorMessage(responseBody: unknown, status: number): string {
  if (responseBody && typeof responseBody === "object" && "error" in responseBody && typeof (responseBody as any).error === "string") {
    return (responseBody as any).error;
  }
  return `Request failed with status ${status}`;
}

const RETRY_DELAYS = [2000, 5000, 10000]; // 2s → 5s → 10s

/**
 * Tracks timestamps of recent calls per function to prevent rapid-fire requests.
 */
const lastCallTimestamps = new Map<string, number>();
const MIN_CALL_INTERVAL = 1500; // 1.5s minimum between calls to same function

export async function fetchEdgeFunctionJson<T>(
  functionName: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  // Throttle: enforce minimum interval between calls to the same function
  const now = Date.now();
  const lastCall = lastCallTimestamps.get(functionName) || 0;
  const elapsed = now - lastCall;
  if (elapsed < MIN_CALL_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_CALL_INTERVAL - elapsed));
  }
  lastCallTimestamps.set(functionName, Date.now());

  let lastError: EdgeFunctionError | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    // If this is a retry, wait with backoff
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      // Add jitter ±20%
      const jitter = delay * 0.2 * (Math.random() * 2 - 1);
      await new Promise(resolve => setTimeout(resolve, Math.round(delay + jitter)));
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    const responseBody = await readResponseBody(response);

    if (response.ok) {
      // Check for error in body even on 200
      if (responseBody && typeof responseBody === "object" && "error" in responseBody && responseBody.error) {
        throw new EdgeFunctionError(String(responseBody.error), response.status || 500);
      }
      return responseBody as T;
    }

    const errorMessage = extractErrorMessage(responseBody, response.status);
    lastError = new EdgeFunctionError(errorMessage, response.status);

    // Only retry on 429 (rate limit) or 5xx (server error)
    const isRetryable = response.status === 429 || response.status >= 500;
    if (!isRetryable || attempt === RETRY_DELAYS.length) {
      throw lastError;
    }

    // Don't retry on auth errors
    if (response.status === 401 || response.status === 403) {
      throw lastError;
    }
  }

  throw lastError || new EdgeFunctionError("Request failed after retries", 500);
}
