/**
 * Phase C2 — Together AI Adapter (free tier — Zero-Cost Hydra Router primary).
 *
 * Together AI offers generous free tier with various image models including
 * Flux variants. This adapter integrates with the Hydra Router as a primary
 * free fallback alongside HuggingFace.
 *
 * Zero-Cost Hydra Router Architecture:
 *   Layer 1 (Free Keyed): HF → Together AI → Gemini Free
 *   Layer 2 (Free Keyless): Pollinations (ultimate fallback)
 *   Layer 3 (Premium): Agnes → Gemini
 *
 * Vendor quirks handled via translateError.
 */
import { aspectRatioPixels } from "./aspect.js";
import { probeHealth } from "./health.js";
import { KeyedLane, type VendorErrorContext } from "./keyed-lane.js";
import { RequestQueue } from "./request-queue.js";
import { bytesToDataUrl } from "./base64.js";
import {
  isRecord,
  NormalizedProviderError,
  type ImageGenerateRequest,
  type ImageGenerateResult,
  type ImageProvider,
  type ProviderHealthReport,
} from "./types.js";

export const TOGETHER_DEFAULT_BASE_URL = "https://api.together.xyz/v1/images/generations";
export const TOGETHER_API_BASE_URL = "https://api.together.xyz/v1/models";
export const TOGETHER_DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell-Free";

export interface TogetherAIAdapterOptions {
  keys: string[];
  baseUrl?: string;
  apiBaseUrl?: string;
  model?: string;
  queue?: RequestQueue;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/**
 * Together AI response shape: { data: [{ url: string }] }
 */
function extractTogetherImageUrl(data: unknown): string | undefined {
  if (!isRecord(data) || !Array.isArray(data.data)) return undefined;
  const first: unknown = data.data[0];
  if (!isRecord(first)) return undefined;
  if (typeof first.url === "string" && first.url.length > 0) return first.url;
  return undefined;
}

function togetherTranslateError(ctx: VendorErrorContext): NormalizedProviderError | undefined {
  // Together AI specific error handling
  if (ctx.status === 429) {
    return new NormalizedProviderError(
      "together",
      "rate_limit",
      `together: rate limited${ctx.retryAfterMs !== undefined ? ` (retry in ${ctx.retryAfterMs}ms)` : ""}`,
      { statusCode: 429, retryAfterMs: ctx.retryAfterMs },
    );
  }
  if (ctx.status === 402) {
    return new NormalizedProviderError(
      "together",
      "quota_exceeded",
      "together: quota exceeded",
      { statusCode: 402 },
    );
  }
  if (ctx.status === 401 || ctx.status === 403) {
    return new NormalizedProviderError(
      "together",
      "auth",
      "together: authentication failed (check API key)",
      { statusCode: ctx.status },
    );
  }
  return undefined;
}

export class TogetherAIAdapter implements ImageProvider {
  readonly id = "together" as const;
  readonly tier = "free" as const;
  readonly keyless = false as const;

  private readonly lane: KeyedLane | undefined;
  private readonly baseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: TogetherAIAdapterOptions) {
    this.baseUrl = options.baseUrl ?? TOGETHER_DEFAULT_BASE_URL;
    this.apiBaseUrl = options.apiBaseUrl ?? TOGETHER_API_BASE_URL;
    this.model = options.model ?? TOGETHER_DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    const keys = options.keys.map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      this.lane = new KeyedLane({
        provider: this.id,
        keys,
        fetchImpl: this.fetchImpl,
        now: this.now,
        timeoutMs: options.timeoutMs ?? 30_000,
        queue: options.queue ?? new RequestQueue(this.id, { concurrency: 2, maxQueue: 100 }),
        translateError: togetherTranslateError,
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
        "together: no API keys configured (IMAGE_API_KEYS together:...)",
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
            steps: 4, // Schnell model uses fewer steps
            n: 1,
            response_format: "url",
            ...(request.seed !== undefined ? { seed: request.seed } : {}),
          }),
          signal,
        }),
      request.signal,
    );

    const data: unknown = await response.json().catch(() => undefined);
    const imageUrl = extractTogetherImageUrl(data);
    if (!imageUrl) {
      throw new NormalizedProviderError(
        this.id,
        "provider_unavailable",
        "together: response contained no image URL",
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
    return probeHealth(this.id, this.apiBaseUrl, {
      fetchImpl: this.fetchImpl,
      now: this.now,
    });
  }
}
