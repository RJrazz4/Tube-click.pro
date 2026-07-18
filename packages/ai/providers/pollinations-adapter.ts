/**
 * Phase 3 — PollinationsAdapter
 *
 * Free / fallback tier: Pollinations AI image generation.
 * Zero authentication required — purely URL-based.
 *
 * Because there are no API keys, this adapter never throws
 * `RateLimitError` or `QuotaExceededError` in the traditional sense.
 * If the free endpoint returns a 429 (unusual but possible), the
 * orchestrator logs it and there are no more fallback providers,
 * so the error is surfaced to the caller as-is.
 *
 * URLs produced are directly embeddable in <img> tags.
 */

import {
  ImageProvider,
  GenerateParams,
  GenerateResult,
  ProviderMeta,
  ProviderUnavailableError,
} from "./types";

const BASE_URL = "https://image.pollinations.ai/prompt";

export class PollinationsAdapter implements ImageProvider {
  readonly name = "pollinations";

  private _available = true;

  isAvailable(): boolean {
    return this._available;
  }

  /** Mark as unavailable (used by the orchestrator on persistent failure). */
  setAvailable(v: boolean): void {
    this._available = v;
  }

  /**
   * Generate images via Pollinations direct URL.
   *
   * Pollinations uses `GET /prompt/{encodedPrompt}?params` — each generated
   * image is a different variation depending on the seed parameter, so we
   * generate multiple URLs with different seeds rather than making N calls.
   */
  async generate(
    params: GenerateParams,
    _signal?: AbortSignal
  ): Promise<GenerateResult & Partial<ProviderMeta>> {
    const t0 = performance.now();
    const count = params.count ?? 1;
    const seedBase = params.seed ?? Math.floor(Math.random() * 100_000);

    const images: string[] = [];

    for (let i = 0; i < count; i++) {
      const url = buildPollinationsUrl({
        prompt: params.prompt,
        width: params.width,
        height: params.height,
        seed: seedBase + i,
        model: "flux",
      });
      images.push(url);
    }

    const latencyMs = Math.round(performance.now() - t0);

    // Pollinations URLs are valid immediately (lazy-loaded by <img>),
    // so we report success straight away.  The first actual HTTP request
    // happens in the browser when the <img> src is set.
    return {
      images,
      provider: this.name,
      latencyMs,
      info: "Pollinations free — URLs generated, images load on request",
    };
  }
}

/* ------------------------------------------------------------------ *
 * URL builder — mirrors the existing pattern in src/api/server/imageRouter.ts
 * ------------------------------------------------------------------ */

interface BuildUrlParams {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  model?: string;
}

function buildPollinationsUrl(params: BuildUrlParams): string {
  const encoded = encodeURIComponent(params.prompt);
  const model = params.model || "flux";
  return `${BASE_URL}/${encoded}?width=${params.width}&height=${params.height}&nologo=true&seed=${params.seed}&model=${model}`;
}
