/**
 * Phase C2 — Replicate Adapter (free tier — Zero-Cost Hydra Router primary).
 *
 * Replicate offers pay-per-second pricing but also has free tier models.
 * This adapter integrates with the Hydra Router as a primary free fallback.
 *
 * Zero-Cost Hydra Router Architecture:
 *   Layer 1 (Free Keyed): HF → Together AI → Replicate
 *   Layer 2 (Free Keyless): Pollinations (ultimate fallback)
 *   Layer 3 (Premium): Agnes → Gemini
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

export const REPLICATE_DEFAULT_API_URL = "https://api.replicate.com/v1/predictions";
export const REPLICATE_DEFAULT_MODEL = "black-forest-labs/flux-schnell";
export const REPLICATE_API_BASE_URL = "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell";

export interface ReplicateAdapterOptions {
  keys: string[];
  apiUrl?: string;
  model?: string;
  queue?: RequestQueue;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

function replicateTranslateError(ctx: VendorErrorContext): NormalizedProviderError | undefined {
  if (ctx.status === 429) {
    return new NormalizedProviderError(
      "replicate",
      "rate_limit",
      `replicate: rate limited${ctx.retryAfterMs !== undefined ? ` (retry in ${ctx.retryAfterMs}ms)` : ""}`,
      { statusCode: 429, retryAfterMs: ctx.retryAfterMs },
    );
  }
  if (ctx.status === 401 || ctx.status === 403) {
    return new NormalizedProviderError(
      "replicate",
      "auth",
      "replicate: authentication failed (check API token)",
      { statusCode: ctx.status },
    );
  }
  return undefined;
}

export class ReplicateAdapter implements ImageProvider {
  readonly id = "replicate" as const;
  readonly tier = "free" as const;
  readonly keyless = false as const;

  private readonly lane: KeyedLane | undefined;
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: ReplicateAdapterOptions) {
    this.apiUrl = options.apiUrl ?? REPLICATE_DEFAULT_API_URL;
    this.model = options.model ?? REPLICATE_DEFAULT_MODEL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    const keys = options.keys.map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      this.lane = new KeyedLane({
        provider: this.id,
        keys,
        fetchImpl: this.fetchImpl,
        now: this.now,
        timeoutMs: options.timeoutMs ?? 60_000, // Replicate can be slower
        queue: options.queue ?? new RequestQueue(this.id, { concurrency: 1, maxQueue: 50 }),
        translateError: replicateTranslateError,
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
        "replicate: no API tokens configured (IMAGE_API_KEYS replicate:...)",
      );
    }
    const started = this.now();
    const { width, height } = aspectRatioPixels(request.aspectRatio);

    // Replicate uses a two-step process: create prediction, then poll for completion
    const { response, keyIndex, attempts } = await this.lane.request(
      async (key, signal) => {
        // Step 1: Create prediction
        const createResponse = await this.fetchImpl(this.apiUrl, {
          method: "POST",
          headers: {
            Authorization: `Token ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            version: this.model,
            input: {
              prompt: request.prompt,
              ...(request.negativePrompt ? { negative_prompt: request.negativePrompt } : {}),
              width,
              height,
              num_inference_steps: 4,
              seed: request.seed ?? Math.floor(Math.random() * 2147483647),
            },
          }),
          signal,
        });

        if (!createResponse.ok) {
          throw new Error(`Replicate prediction creation failed: ${createResponse.status}`);
        }

        const prediction = await createResponse.json() as { id: string; urls?: { get?: string } };
        
        // Step 2: Poll for completion
        const pollUrl = prediction.urls?.get ?? `${this.apiUrl}/${prediction.id}`;
        const maxPolls = 60; // 60 seconds max
        let pollCount = 0;

        while (pollCount < maxPolls) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          pollCount++;

          const pollResponse = await this.fetchImpl(pollUrl, {
            headers: { Authorization: `Token ${key}` },
            signal,
          });

          if (!pollResponse.ok) {
            throw new Error(`Replicate polling failed: ${pollResponse.status}`);
          }

          const status = await pollResponse.json() as { status: string; output?: string[]; error?: string };
          
          if (status.status === "succeeded") {
            // Output is an array of URLs
            if (status.output && status.output.length > 0) {
              // Fetch the actual image to convert to data URL
              const imageResponse = await this.fetchImpl(status.output[0], { signal });
              if (imageResponse.ok) {
                const bytes = new Uint8Array(await imageResponse.arrayBuffer());
                return new Response(bytes, {
                  status: 200,
                  headers: { "Content-Type": "image/png" },
                });
              }
            }
            throw new Error("Replicate output empty");
          } else if (status.status === "failed") {
            throw new Error(`Replicate prediction failed: ${status.error || "unknown error"}`);
          }
          // status === "processing" or "starting" - continue polling
        }

        throw new Error("Replicate prediction timed out after 60 seconds");
      },
      request.signal,
    );

    const contentType = response.headers.get("content-type") ?? "image/png";
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new NormalizedProviderError(this.id, "provider_unavailable", "replicate: empty image payload");
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
    return probeHealth(this.id, REPLICATE_API_BASE_URL, {
      fetchImpl: this.fetchImpl,
      now: this.now,
    });
  }
}
