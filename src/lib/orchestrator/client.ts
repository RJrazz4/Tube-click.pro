/**
 * Orchestrator API client (typed, injectable, honest errors).
 *
 * Merge-resolution contract adapter. The UI surface (components, view-models,
 * wire types) is unchanged; this client now talks to the LIVE endpoints:
 *
 *   POST /api/analyze-storyboard   planner — script → scene prompts (live)
 *   POST /api/v1/storyboard        batch scene images (strict Zod schema)
 *   POST /api/v1/thumbnail         batch thumbnails (strict Zod schema)
 *   GET  /api/v1/tiers             authoritative tier catalog
 *
 * Previously this called the non-existent /api/v1/thumbnails (→ live 404) and
 * posted { script } straight to /api/v1/storyboard (→ strict-Zod 400).
 *
 * Request payloads are built by src/lib/v1Payloads.ts (Zod-conformant by
 * contract test). The v1 endpoints answer { success:true, data:{...} } and
 * fail as { success:false, error, code, fields?, retryAfter? }; the future
 * orchestrator-native { error:{ code, message, details } } shape is also
 * accepted. Everything maps onto OrchestratorApiError, so the UI's error
 * surface (toUiError) needs no changes.
 */
import { getSessionAuthHeaders } from "./auth-headers";
import { toEngineTier } from "./storyboard-view";
import type {
  EngineTier,
  OrchestratorSceneRow,
  OrchestratorStoryboardResponse,
  OrchestratorSummary,
  OrchestratorThumbnailsResponse,
  OrchestratorTiersResponse,
} from "./types";
import {
  buildV1StoryboardScenesBody,
  buildV1ThumbnailBody,
  unwrapV1,
} from "@/lib/v1Payloads";
import { useAppStore } from "@/stores/useAppStore";

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

/* ------------------------------------------------------------------ *
 * Live v1 wire shapes (post-unwrap of the { success, data } envelope)
 * ------------------------------------------------------------------ */

interface V1StoryboardSceneRow {
  scene_number?: number;
  image_url?: string;
  provider?: string;
  from_fallback?: boolean;
  degraded?: boolean;
  /** Exact failure / fallback reason from the engine (e.g. "429 Rate Limit"). */
  error?: string;
}

interface V1StoryboardData {
  tier?: string;
  brand?: string;
  scenes?: V1StoryboardSceneRow[];
  total_scenes?: number;
  requested_scenes?: number;
  truncated?: boolean;
}

interface V1ThumbnailRow {
  index?: number;
  url?: string | null;
  provider?: string;
  from_fallback?: boolean;
  /** Exact failure / fallback reason from the engine (e.g. "429 Rate Limit"). */
  error?: string;
}

interface V1ThumbnailData {
  tier?: string;
  brand?: string;
  thumbnails?: V1ThumbnailRow[];
  total_generated?: number;
  requested?: number;
  truncated?: boolean;
  total_latency_ms?: number;
}

interface AnalyzeScene {
  scene_number?: number;
  visual_prompt?: string;
  motion_prompt?: string;
}

interface AnalyzePlannerBody {
  scenes?: AnalyzeScene[];
}

const DEFAULT_BASE_URL = (): string =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/** Parse Retry-After (seconds) into a number, or undefined. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number.parseFloat(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/** Store tier ("free" | "pro" | "enterprise") — "free" when unreadable (tests/ssr). */
function clientRawTier(): string {
  try {
    return useAppStore.getState().tier ?? "free";
  } catch {
    return "free";
  }
}

/** server free|premium + store rawTier → engine tier shown in the UI. */
function engineTierFor(serverTier: string | undefined, rawTier: string): EngineTier {
  if (serverTier !== "premium") return "free";
  return toEngineTier(rawTier === "free" ? "pro" : rawTier);
}

function brandForRawTier(rawTier: string): string {
  return rawTier === "free" ? "Tube.Flash" : "Tube.Pro";
}

function costOf(brand: string | undefined): OrchestratorSceneRow["costTier"] {
  return brand === "Tube.Flash" ? "free" : "premium";
}

function summarize(rows: OrchestratorSceneRow[], avgLatencyMs: number): OrchestratorSummary {
  const succeeded = rows.filter((r) => r.status === "success").length;
  return {
    total: rows.length,
    succeeded,
    failed: rows.length - succeeded,
    fallbackTriggered: rows.filter((r) => r.isFallback).length,
    premiumScenes: rows.filter((r) => r.costTier === "premium").length,
    totalKeyRotations: 0, // rotation happens inside /api/* — not exposed per run
    avgLatencyMs,
  };
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
      // Aborts (Cancel button) must stay DOMException(AbortError) for the UI
      if ((err as { name?: string })?.name === "AbortError") throw err;
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
      let retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
      try {
        const body: unknown = await response.json();
        if (
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof (body as { error?: { code?: unknown } }).error === "object"
        ) {
          // Shape A — orchestrator-native { error: { code, message, details } }
          const apiError = (body as { error: { code?: string; message?: string; details?: unknown } }).error;
          if (typeof apiError.code === "string") code = apiError.code;
          if (typeof apiError.message === "string") message = apiError.message;
          details = apiError.details;
        } else if (
          typeof body === "object" &&
          body !== null &&
          typeof (body as { error?: unknown }).error === "string"
        ) {
          // Shape B — live v1 envelope { success:false, error, code, fields?, retryAfter? }
          const b = body as { error: string; code?: string; fields?: unknown; retryAfter?: number };
          message = b.error;
          if (b.code === "BAD_REQUEST") code = "invalid_request";
          else if (b.code === "RATE_LIMITED") code = "rate_limit_exceeded";
          else if (typeof b.code === "string") code = b.code.toLowerCase();
          if (b.fields !== undefined) details = { fields: b.fields };
          if (typeof b.retryAfter === "number" && b.retryAfter >= 0) retryAfterSeconds = b.retryAfter;
        }
      } catch {
        // body wasn't JSON — keep the HTTP-default message
      }
      throw new OrchestratorApiError(response.status, code, message, {
        ...(details !== undefined ? { details } : {}),
        ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      });
    }

    return (await response.json()) as T;
  }

  return {
    /**
     * Step 1 (planner): legacy live analysis endpoint turns the script into
     * scene prompts. Step 2: ONE batch call to the versioned storyboard
     * endpoint with a strict-Zod-safe body built from those scenes.
     */
    storyboard: async (input, signal) => {
      const init = (body: unknown): RequestInit => ({
        method: "POST",
        body: JSON.stringify(body),
        ...(signal !== undefined ? { signal } : {}),
      });

      let planner: AnalyzePlannerBody;
      try {
        planner = await call<AnalyzePlannerBody>("/api/analyze-storyboard", init({ script: input.script }));
      } catch (err) {
        if (err instanceof OrchestratorApiError && err.code !== "network_error") {
          throw new OrchestratorApiError(
            err.status,
            "planner_unavailable",
            "Scene planning failed — the analysis engine could not read this script.",
            {
              ...(err.details !== undefined ? { details: err.details } : {}),
              ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
            },
          );
        }
        throw err; // AbortError / network_error pass through as-is
      }

      const analyzed = Array.isArray(planner?.scenes) ? planner.scenes : [];
      if (analyzed.length === 0) {
        throw new OrchestratorApiError(502, "planner_unavailable", "Scene planning returned no scenes.");
      }

      const rawTier = clientRawTier();
      const body = buildV1StoryboardScenesBody({
        topic: input.script,
        scenes: analyzed.map((s, i) => ({
          sceneNumber: typeof s.scene_number === "number" ? s.scene_number : i + 1,
          prompt: s.visual_prompt ?? "",
          ...(s.motion_prompt ? { motionPrompt: s.motion_prompt } : {}),
        })),
        brand: brandForRawTier(rawTier),
        rawTier,
        aspectRatio: "16:9",
        script: input.script,
      });
      const payload =
        typeof input.seed === "number" ? { ...body, seed: Math.round(input.seed) } : body;

      const envelope = await call<{ success?: boolean; data?: V1StoryboardData }>(
        "/api/v1/storyboard",
        init(payload),
      );
      const data = unwrapV1(envelope);

      const costTier = costOf(data?.brand ?? body.brand);
      const rows: OrchestratorSceneRow[] = (data?.scenes ?? []).map((row, i) => {
        const url = typeof row.image_url === "string" && row.image_url ? row.image_url : undefined;
        const sceneRow: OrchestratorSceneRow = {
          sceneIndex: (typeof row.scene_number === "number" ? row.scene_number : i + 1) - 1,
          status: url ? "success" : "failed",
          isFallback: row.from_fallback ?? !url,
          attempts: 1,
          latencyMs: 0, // run-level latency isn't reported per scene by the live API
        };
        if (url !== undefined) sceneRow.imageUrl = url;
        else sceneRow.error = row.error ?? "Generation failed";
        if (row.provider !== undefined) sceneRow.provider = row.provider;
        sceneRow.costTier = costTier;
        return sceneRow;
      });

      const plannedScenes = analyzed.length;
      const generatedScenes = data?.total_scenes ?? rows.length;
      return {
        tier: engineTierFor(data?.tier, rawTier),
        plannedScenes,
        generatedScenes,
        truncated: Boolean(data?.truncated) || generatedScenes < plannedScenes,
        remainingScenes: Math.max(0, plannedScenes - generatedScenes),
        characterProfile: null,
        scenes: rows,
        summary: summarize(rows, 0),
        meta: {
          model: "analyze-storyboard → /api/v1/storyboard",
          attempts: 1,
          complexityOverrides: 0,
          llmLatencyMs: 0,
        },
      };
    },

    /**
     * Versioned thumbnail endpoint (singular — the plural path never existed
     * and produced the live 404). The UI's free-form prompt maps onto the
     * schema's required title; emotion/style use house defaults.
     */
    thumbnails: async (input, signal) => {
      const rawTier = clientRawTier();
      const body = buildV1ThumbnailBody({
        title: input.prompt,
        emotion: "excited",
        style: "cinematic",
        aspectRatio: "16:9",
        count: input.count ?? 1,
        brand: brandForRawTier(rawTier),
        rawTier,
      });
      const payload =
        typeof input.seed === "number" ? { ...body, seed: Math.round(input.seed) } : body;

      const envelope = await call<{ success?: boolean; data?: V1ThumbnailData }>(
        "/api/v1/thumbnail",
        {
          method: "POST",
          body: JSON.stringify(payload),
          ...(signal !== undefined ? { signal } : {}),
        },
      );
      const data = unwrapV1(envelope);

      const costTier = costOf(data?.brand ?? body.brand);
      const rows: OrchestratorSceneRow[] = (data?.thumbnails ?? []).map((row, i) => {
        const url = typeof row.url === "string" && row.url ? row.url : undefined;
        const sceneRow: OrchestratorSceneRow = {
          sceneIndex: (typeof row.index === "number" ? row.index : i + 1) - 1,
          status: url ? "success" : "failed",
          isFallback: row.from_fallback ?? !url,
          attempts: 1,
          latencyMs: Math.max(0, Math.round(data?.total_latency_ms ?? 0)),
        };
        if (url !== undefined) sceneRow.imageUrl = url;
        else sceneRow.error = row.error ?? "Generation failed";
        if (row.provider !== undefined) sceneRow.provider = row.provider;
        sceneRow.costTier = costTier;
        return sceneRow;
      });

      return {
        tier: engineTierFor(data?.tier, rawTier),
        count: data?.total_generated ?? rows.length,
        thumbnails: rows,
        summary: summarize(rows, Math.max(0, Math.round(data?.total_latency_ms ?? 0))),
      };
    },

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
