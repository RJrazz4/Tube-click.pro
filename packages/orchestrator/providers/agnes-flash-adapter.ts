/**
 * Phase C2 — AgnesFlashAdapter (premium).
 *
 * ⚠ ENDNOTE ON PROVENANCE: "agnes" is carried over from the legacy
 * codebase whose endpoint (api.agnesflash.io) was never a verified public
 * service — treat baseUrl as PROVISIONAL config, not fact. The adapter
 * speaks the de-facto OpenAI images API shape
 * (POST /images/generations → data[0].url | b64_json), so whatever real
 * endpoint gets provisioned for the "agnes" lane drops in via config
 * with zero code change. Model defaults to the Master Plan identifier
 * agnes-image-2.0-flash; override when the real vendor is known.
 *
 * Premium = tokens cost money: C3 routes here ONLY for COMPLEX scenes
 * (token-saving mandate).
 */
import { KeyedLane } from "./keyed-lane.js";
import { aspectRatioSizeString } from "./aspect.js";
import { probeHealth } from "./health.js";
import { RequestQueue } from "./request-queue.js";
import {
  isRecord,
  NormalizedProviderError,
  type ImageGenerateRequest,
  type ImageGenerateResult,
  type ImageProvider,
  type ProviderHealthReport,
} from "./types.js";

export const AGNES_DEFAULT_BASE_URL = "https://api.agnesflash.io/v1"; // provisional — see docblock
export const AGNES_DEFAULT_MODEL = "agnes-image-2.0-flash";

export interface AgnesFlashAdapterOptions {
  keys: string[];
  baseUrl?: string;
  model?: string;
  queue?: RequestQueue;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/** data[0].url, or b64_json materialized as a data URL. */
function extractImageUrl(data: unknown): string | undefined {
  if (!isRecord(data) || !Array.isArray(data.data)) return undefined;
  const first: unknown = data.data[0];
  if (!isRecord(first)) return undefined;
  if (typeof first.url === "string" && first.url.length > 0) return first.url;
  if (typeof first.b64_json === "string" && first.b64_json.length > 0) {
    return `data:image/png;base64,${first.b64_json}`;
  }
  return undefined;
}

export class AgnesFlashAdapter implements ImageProvider {
  readonly id = "agnes" as const;
  readonly tier = "premium" as const;
  readonly keyless = false as const;

  private readonly lane: KeyedLane | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly firstKey: string | undefined;

  constructor(options: AgnesFlashAdapterOptions) {
    this.baseUrl = options.baseUrl ?? AGNES_DEFAULT_BASE_URL;
    this.model = options.model ?? AGNES_DEFAULT_MODEL;
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
        timeoutMs: options.timeoutMs,
        queue: options.queue ?? new RequestQueue(this.id, { concurrency: 4, maxQueue: 200 }),
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
        "agnes: no API keys configured (IMAGE_API_KEYS agnes:...)",
      );
    }
    const started = this.now();
    const { response, keyIndex, attempts } = await this.lane.request(
      (key, signal) =>
        this.fetchImpl(`${this.baseUrl}/images/generations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            prompt: request.prompt,
            ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
            size: aspectRatioSizeString(request.aspectRatio),
            n: 1,
            ...(request.seed !== undefined ? { seed: request.seed } : {}),
            response_format: "url",
          }),
          signal,
        }),
      request.signal,
    );

    const data: unknown = await response.json().catch(() => undefined);
    const imageUrl = extractImageUrl(data);
    if (!imageUrl) {
      throw new NormalizedProviderError(
        this.id,
        "provider_unavailable",
        "agnes: response contained no image (data[0].url / b64_json)",
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
    return probeHealth(this.id, `${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.firstKey}` },
      fetchImpl: this.fetchImpl,
      now: this.now,
    });
  }
}
