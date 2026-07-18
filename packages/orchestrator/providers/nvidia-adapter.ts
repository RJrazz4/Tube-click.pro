/**
 * Phase C2+ — NVIDIA NIM Adapter (free tier — 5-Engine Pool).
 *
 * NVIDIA NIM provides free-tier access to image generation models
 * including SDXL and Flux variants via their API catalog.
 *
 * 5-Engine Architecture — Layer 1 (Free Keyed):
 *   HF → Together AI → NVIDIA NIM → Replicate
 *
 * The NVIDIA NIM API uses an OpenAI-compatible endpoint:
 *   POST https://integrate.api.nvidia.com/v1/images/generations
 *   Authorization: Bearer $NVIDIA_API_KEY
 *   Body: { model, prompt, n, size, response_format }
 *
 * Response: { data: [{ url: string }] } or { data: [{ b64_json: string }] }
 *
 * Comma-separated keys in NVIDIA_API_KEY support multi-account round-robin.
 * On 429/401, the KeyedLane rotates to the next key. If all NVIDIA keys
 * fail, the fallback executor cascades to the next provider (Replicate).
 */
import { aspectRatioPixels } from "./aspect.js";
import { probeHealth } from "./health.js";
import { KeyedLane, type VendorErrorContext } from "./keyed-lane.js";
import { RequestQueue } from "./request-queue.js";
import {
  isRecord,
  NormalizedProviderError,
  type ImageGenerateRequest,
  type ImageGenerateResult,
  type ImageProvider,
  type ProviderHealthReport,
} from "./types.js";

export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1/images/generations";
export const NVIDIA_DEFAULT_MODEL = "black-forest-labs/flux-schnell";
export const NVIDIA_HEALTH_URL = "https://integrate.api.nvidia.com/v1/models";

export interface NvidiaAdapterOptions {
  keys: string[];
  baseUrl?: string;
  model?: string;
  queue?: RequestQueue;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/**
 * NVIDIA NIM response shape: { data: [{ url: string }] } or
 * { data: [{ b64_json: string }] }
 */
function extractNvidiaImageUrl(data: unknown): string | undefined {
  if (!isRecord(data) || !Array.isArray(data.data)) return undefined;
  const first: unknown = data.data[0];
  if (!isRecord(first)) return undefined;
  if (typeof first.url === "string" && first.url.length > 0) return first.url;
  if (typeof first.b64_json === "string" && first.b64_json.length > 0) {
    return `data:image/png;base64,${first.b64_json}`;
  }
  return undefined;
}

function nvidiaTranslateError(ctx: VendorErrorContext): NormalizedProviderError | undefined {
  if (ctx.status === 429) {
    return new NormalizedProviderError(
      "nvidia",
      "rate_limit",
      `nvidia: rate limited${ctx.retryAfterMs !== undefined ? ` (retry in ${ctx.retryAfterMs}ms)` : ""}`,
      { statusCode: 429, retryAfterMs: ctx.retryAfterMs },
    );
  }
  if (ctx.status === 402) {
    return new NormalizedProviderError(
      "nvidia",
      "quota_exceeded",
      "nvidia: quota exceeded",
      { statusCode: 402 },
    );
  }
  if (ctx.status === 401 || ctx.status === 403) {
    return new NormalizedProviderError(
      "nvidia",
      "auth",
      "nvidia: authentication failed (check API key)",
      { statusCode: ctx.status },
    );
  }
  return undefined;
}

export class NvidiaAdapter implements ImageProvider {
  readonly id = "nvidia" as const;
  readonly tier = "free" as const;
  readonly keyless = false as const;

  private readonly lane: KeyedLane | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly firstKey: string | undefined;

  constructor(options: NvidiaAdapterOptions) {
    this.baseUrl = options.baseUrl ?? NVIDIA_DEFAULT_BASE_URL;
    this.model = options.model ?? NVIDIA_DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    const keys = options.keys.map((k) => k.trim()).filter(Boolean);
    this.firstKey = keys[0];
    if (keys.length > 0) {
      this.lane = new KeyedLane({
        provider: this.id,
        keys,
        fetchImpl: this.fetchImpl,
        now: this.now,
        timeoutMs: options.timeoutMs ?? 30_000,
        queue: options.queue ?? new RequestQueue(this.id, { concurrency: 2, maxQueue: 100 }),
        translateError: nvidiaTranslateError,
      });
    }
  }

  isAvailable(): boolean {
    return this.lane !== undefined;
  }

  async generate(request: ImageGenerateRequest): Promise<ImageGenerateResult> {
    if (!this.lane) {
      throw new NormalizedProviderError(
        this.id,
        "auth",
        "nvidia: no API keys configured (set NVIDIA_API_KEY env var)",
      );
    }
    const started = this.now();
    const { width, height } = aspectRatioPixels(request.aspectRatio);

    const { response, keyIndex, attempts } = await this.lane.request(
      (key, signal) =>
        this.fetchImpl(this.baseUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            prompt: request.prompt,
            ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
            width,
            height,
            n: 1,
            response_format: "url",
            ...(request.seed !== undefined ? { seed: request.seed } : {}),
          }),
          signal,
        }),
      request.signal,
    );

    const data: unknown = await response.json().catch(() => undefined);
    const imageUrl = extractNvidiaImageUrl(data);
    if (!imageUrl) {
      throw new NormalizedProviderError(
        this.id,
        "provider_unavailable",
        "nvidia: response contained no image URL",
      );
    }
    return {
      imageUrl,
      provider: this.id,
      urlOnly: false,
      latencyMs: this.now() - started,
      keyIndex,
      keyRotations: attempts - 1,
    };
  }

  async healthCheck(): Promise<ProviderHealthReport> {
    if (!this.firstKey) {
      return { provider: this.id, state: "down", detail: "no keys configured", latencyMs: 0, checkedAt: this.now() };
    }
    return probeHealth(this.id, NVIDIA_HEALTH_URL, {
      headers: { Authorization: `Bearer ${this.firstKey}` },
      fetchImpl: this.fetchImpl,
      now: this.now,
    });
  }
}
