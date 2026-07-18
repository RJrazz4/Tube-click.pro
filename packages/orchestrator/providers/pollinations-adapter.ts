/**
 * Phase C2 — PollinationsAdapter: the keyless, URL-only ultimate fallback.
 *
 * This adapter never fetches image bytes server-side in its default mode:
 * it MINTS a pollinations.ai URL and hands it back. The browser loads the
 * image directly. At 10k concurrent users the overflow path therefore
 * costs the server ~zero CPU, ~zero network, ~zero tokens.
 *
 * That is the scalability sink: C3 routes surplus/failed traffic here and
 * the process never breaks a sweat. Also the token-saving baseline —
 * every Pollinations scene is 100% free.
 *
 * NOTE: pollinations' URL API has no negative-prompt channel; the
 * manager (B2) already folds critical avoid-terms into the prompt itself.
 */
import { aspectRatioPixels } from "./aspect.js";
import { probeHealth } from "./health.js";
import {
  NormalizedProviderError,
  type ImageGenerateRequest,
  type ImageGenerateResult,
  type ImageProvider,
  type ProviderHealthReport,
} from "./types.js";

export const POLLINATIONS_BASE_URL = "https://image.pollinations.ai/prompt";
export const POLLINATIONS_DEFAULT_MODEL = "flux";

export interface PollinationsAdapterOptions {
  /** POLLINATIONS_ENABLED; default true. */
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  /** Only used when probeHealth is true (generate() never fetches). */
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Perform a real network probe in healthCheck; default false. */
  probeHealth?: boolean;
}

export class PollinationsAdapter implements ImageProvider {
  readonly id = "pollinations" as const;
  readonly tier = "free" as const;
  readonly keyless = true as const;

  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly probeHealth: boolean;

  constructor(options: PollinationsAdapterOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.baseUrl = options.baseUrl ?? POLLINATIONS_BASE_URL;
    this.model = options.model ?? POLLINATIONS_DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.probeHealth = options.probeHealth ?? false;
  }

  isAvailable(): boolean {
    return this.enabled;
  }

  /** Pure URL construction — exported for router/UI reuse. */
  buildUrl(request: ImageGenerateRequest): string {
    const { width, height } = aspectRatioPixels(request.aspectRatio);
    const params = new URLSearchParams({
      width: String(width),
      height: String(height),
      nologo: "true",
      model: this.model,
    });
    if (request.seed !== undefined) params.set("seed", String(request.seed));
    return `${this.baseUrl}/${encodeURIComponent(request.prompt)}?${params.toString()}`;
  }

  /**
   * Mints the image URL. Makes NO network call — this is what makes the
   * fallback infinitely scalable. Cost: a few microseconds of string work.
   */
  async generate(request: ImageGenerateRequest): Promise<ImageGenerateResult> {
    if (!this.enabled) {
      throw new NormalizedProviderError(
        this.id,
        "provider_unavailable",
        "pollinations is disabled (POLLINATIONS_ENABLED=false)",
      );
    }
    if (request.signal?.aborted) {
      throw new NormalizedProviderError(this.id, "timeout", "pollinations: aborted by caller");
    }
    const started = this.now();
    return {
      imageUrl: this.buildUrl(request),
      provider: this.id,
      urlOnly: true,
      latencyMs: this.now() - started,
      keyRotations: 0,
    };
  }

  async healthCheck(): Promise<ProviderHealthReport> {
    if (!this.enabled) {
      return {
        provider: this.id,
        state: "down",
        detail: "disabled via POLLINATIONS_ENABLED",
        latencyMs: 0,
        checkedAt: this.now(),
      };
    }
    if (!this.probeHealth) {
      return {
        provider: this.id,
        state: "up",
        detail: "url-only mode — no server fetch to probe",
        latencyMs: 0,
        checkedAt: this.now(),
      };
    }
    return probeHealth(this.id, this.baseUrl.replace(/\/prompt$/, ""), {
      fetchImpl: this.fetchImpl,
      now: this.now,
    });
  }
}
