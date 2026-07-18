/**
 * Phase C2 — HuggingFaceAdapter (free tier — token-saving ally).
 *
 * HF Inference Router text-to-image: POST {inputs, parameters} → image
 * bytes → materialized data URL. Free but rate-limited, so this adapter
 * runs the narrowest lane in the system (concurrency 2) and fast-fails
 * overflow to the router — which is precisely the overflow signal C3
 * drains into URL-only Pollinations.
 *
 * Vendor quirk handled via translateError: 503 "model is currently
 * loading" carries estimated_time seconds → provider_unavailable with
 * retryAfterMs (the lane cools the key for exactly that window).
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

export const HF_DEFAULT_BASE_URL = "https://router.huggingface.co/hf-inference/models";
export const HF_DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell";
export const HF_API_BASE_URL = "https://huggingface.co/api/models";

export interface HuggingFaceAdapterOptions {
  keys: string[];
  baseUrl?: string;
  apiBaseUrl?: string;
  model?: string;
  queue?: RequestQueue;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/** HF model-loading sentinel: {"error":"...loading","estimated_time":N}. */
function hfTranslateError(ctx: VendorErrorContext): NormalizedProviderError | undefined {
  if (ctx.status !== 503) return undefined;
  let estimatedMs: number | undefined;
  try {
    const json: unknown = JSON.parse(ctx.bodyText);
    if (isRecord(json) && typeof json.estimated_time === "number" && json.estimated_time >= 0) {
      estimatedMs = Math.ceil(json.estimated_time * 1000);
    }
  } catch {
    // body wasn't JSON — fall through to generic 503
  }
  return new NormalizedProviderError(
    "hf",
    "provider_unavailable",
    `hf: model loading${estimatedMs !== undefined ? ` (est. ${estimatedMs}ms)` : ""}`,
    { statusCode: 503, retryAfterMs: estimatedMs ?? ctx.retryAfterMs },
  );
}

export class HuggingFaceAdapter implements ImageProvider {
  readonly id = "hf" as const;
  readonly tier = "free" as const;
  readonly keyless = false as const;

  private readonly lane: KeyedLane | undefined;
  private readonly baseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: HuggingFaceAdapterOptions) {
    this.baseUrl = options.baseUrl ?? HF_DEFAULT_BASE_URL;
    this.apiBaseUrl = options.apiBaseUrl ?? HF_API_BASE_URL;
    this.model = options.model ?? HF_DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    const keys = options.keys.map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      this.lane = new KeyedLane({
        provider: this.id,
        keys,
        fetchImpl: this.fetchImpl,
        now: this.now,
        timeoutMs: options.timeoutMs ?? 30_000, // free endpoints can be slow to warm
        queue: options.queue ?? new RequestQueue(this.id, { concurrency: 2, maxQueue: 100 }),
        translateError: hfTranslateError,
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
        "hf: no API keys configured (IMAGE_API_KEYS hf:...)",
      );
    }
    const started = this.now();
    const { width, height } = aspectRatioPixels(request.aspectRatio);

    const { response, keyIndex, attempts } = await this.lane.request(
      (key, signal) =>
        this.fetchImpl(`${this.baseUrl}/${this.model}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: request.prompt,
            parameters: {
              ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
              width,
              height,
              ...(request.seed !== undefined ? { seed: request.seed } : {}),
            },
          }),
          signal,
        }),
      request.signal,
    );

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    if (contentType.includes("json")) {
      throw new NormalizedProviderError(
        this.id,
        "provider_unavailable",
        "hf: expected image bytes, got JSON payload",
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new NormalizedProviderError(this.id, "provider_unavailable", "hf: empty image payload");
    }
    return {
      imageUrl: bytesToDataUrl(bytes, contentType),
      provider: this.id,
      urlOnly: false,
      latencyMs: this.now() - started,
      keyIndex,
      keyRotations: attempts - 1,
    };
  }

  async healthCheck(): Promise<ProviderHealthReport> {
    return probeHealth(this.id, `${this.apiBaseUrl}/${this.model}`, {
      fetchImpl: this.fetchImpl,
      now: this.now,
    });
  }
}
