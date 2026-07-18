/**
 * Phase G1 — Orchestrator API client (typed, injectable, honest errors).
 *
 * Thin typed wrapper over the Phase F3 endpoints:
 *   POST {base}/api/v1/storyboard
 *   POST {base}/api/v1/thumbnails
 *   GET  {base}/api/v1/tiers
 *
 * Error contract: everything non-2xx becomes an OrchestratorApiError
 * carrying status + server error code + Retry-After seconds when present
 * (429s render "retry in Ns" UI). Fetch-level failures become
 * code "network_error" with status null — the UI distinguishes "offline"
 * from "server said no".
 */
import { getSessionAuthHeaders } from "./auth-headers";
import type {
  OrchestratorStoryboardResponse,
  OrchestratorThumbnailsResponse,
  OrchestratorTiersResponse,
} from "./types";

export type HeaderProvider = () => Promise<Record<string, string>> | Record<string, string>;

export class OrchestratorApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly details?: unknown;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number | null,
    code: string,
    message: string,
    options: { details?: unknown; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "OrchestratorApiError";
    this.status = status;
    this.code = code;
    if (options.details !== undefined) this.details = options.details;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

export interface OrchestratorClientOptions {
  /** Defaults to the VITE_API_BASE_URL env var, else same-origin "". */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getHeaders?: HeaderProvider;
}

export interface StoryboardInput {
  script: string;
  seed?: number;
}

export interface ThumbnailsInput {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  count?: number;
}

export interface OrchestratorClient {
  storyboard(input: StoryboardInput, signal?: AbortSignal): Promise<OrchestratorStoryboardResponse>;
  thumbnails(input: ThumbnailsInput, signal?: AbortSignal): Promise<OrchestratorThumbnailsResponse>;
  tiers(signal?: AbortSignal): Promise<OrchestratorTiersResponse>;
}

const DEFAULT_BASE_URL = (): string =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/** Parse Retry-After (seconds) into a number, or undefined. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number.parseFloat(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

export function createOrchestratorClient(options: OrchestratorClientOptions = {}): OrchestratorClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL();
  const fetchImpl = options.fetchImpl ?? fetch;

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const extraHeaders = options.getHeaders ? await options.getHeaders() : {};
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...extraHeaders,
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      throw new OrchestratorApiError(
        null,
        "network_error",
        "Couldn't reach the generation service — check your connection and try again.",
        { details: err instanceof Error ? err.message : String(err) },
      );
    }

    if (!response.ok) {
      let code = "internal_error";
      let message = `The generation service answered with HTTP ${response.status}.`;
      let details: unknown;
      try {
        const body: unknown = await response.json();
        if (
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error?: { code?: unknown } }).error === "object"
        ) {
          const apiError = (body as { error: { code?: string; message?: string; details?: unknown } }).error;
          if (typeof apiError.code === "string") code = apiError.code;
          if (typeof apiError.message === "string") message = apiError.message;
          details = apiError.details;
        }
      } catch {
        // body wasn't JSON — keep the HTTP-default message
      }
      throw new OrchestratorApiError(response.status, code, message, {
        details,
        retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
      });
    }

    return (await response.json()) as T;
  }

  return {
    storyboard: (input, signal) =>
      call<OrchestratorStoryboardResponse>("/api/v1/storyboard", {
        method: "POST",
        body: JSON.stringify(input),
        ...(signal !== undefined ? { signal } : {}),
      }),
    thumbnails: (input, signal) =>
      call<OrchestratorThumbnailsResponse>("/api/v1/thumbnails", {
        method: "POST",
        body: JSON.stringify(input),
        ...(signal !== undefined ? { signal } : {}),
      }),
    tiers: (signal) =>
      call<OrchestratorTiersResponse>("/api/v1/tiers", {
        method: "GET",
        ...(signal !== undefined ? { signal } : {}),
      }),
  };
}

/**
 * App singleton — session bearer attached when the user is signed in
 * (lazy; no session = anonymous request, the server resolves tier).
 */
export const orchestratorApi: OrchestratorClient = createOrchestratorClient({
  getHeaders: getSessionAuthHeaders,
});
