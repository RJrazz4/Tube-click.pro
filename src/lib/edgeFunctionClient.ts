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

export async function fetchEdgeFunctionJson<T>(
  functionName: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
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
  const errorMessage =
    responseBody && typeof responseBody === "object" && "error" in responseBody && typeof responseBody.error === "string"
      ? responseBody.error
      : `Request failed with status ${response.status}`;

  if (!response.ok) {
    throw new EdgeFunctionError(errorMessage, response.status);
  }

  if (responseBody && typeof responseBody === "object" && "error" in responseBody && responseBody.error) {
    throw new EdgeFunctionError(String(responseBody.error), response.status || 500);
  }

  return responseBody as T;
}
