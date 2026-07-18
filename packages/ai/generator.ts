/**
 * Phase 3 — Generator Orchestrator
 *
 * The central coordination layer for multi-provider image generation.
 *
 * Architecture:
 *   1. Accepts an ordered list of `ImageProvider` adapters.
 *   2. For each adapter, holds an optional `KeyRotator` for key rotation.
 *   3. Supports parallel batch generation (multiple images at once).
 *   4. On 429 / 402 / 403 / 401 → rotates key via the KeyRotator.
 *   5. On `AllKeysExhaustedError` → falls through to the next provider.
 *   6. If ALL providers in the chain fail, uses the **Pollinations**
 *      fallback adapter (zero auth, always available).
 *   7. Returns a structured `GenerationReport` with per-image provenance
 *      so consumers can display which provider served each image.
 *
 * Usage:
 * ```ts
 * const orchestrator = new GeneratorOrchestrator(
 *   [agnesAdapter, geminiAdapter],   // ordered providers
 *   new Map([                        // key rotators
 *     ["agnes-flash", agnesRotator],
 *     ["gemini-flash", geminiRotator],
 *   ]),
 *   pollinationsAdapter,             // ultimate fallback
 * );
 *
 * const report = await orchestrator.generate(
 *   { prompt: "a cat", width: 1024, height: 1024 },
 *   { count: 4 },
 * );
 * ```
 */

import {
  ImageProvider,
  GenerateParams,
  GenerateResult,
  ProviderMeta,
  RateLimitError,
  QuotaExceededError,
  ProviderAuthError,
  AllKeysExhaustedError,
  isRateLimitError,
  isQuotaExceededError,
  isProviderAuthError,
  isAllKeysExhaustedError,
} from "./providers/types.js";
import { KeyRotator } from "./providers/key-rotator.js";
import { PollinationsAdapter } from "./providers/pollinations-adapter.js";

/* ------------------------------------------------------------------ *
 * Public types
 * ------------------------------------------------------------------ */

/** Per-image provenance tracked in the final report. */
export interface ImageProvenance {
  /** The public URL of the generated image. */
  url: string;
  /** Which provider adapter served this image. */
  provider: string;
  /** Whether this image was served by the ultimate Pollinations fallback. */
  fromFallback: boolean;
  /** Additional metadata (model used, degradation info, etc.). */
  meta?: ProviderMeta;
}

/** Structured report returned by the orchestrator after generation. */
export interface GenerationReport {
  /** All successfully generated images, in order. */
  images: ImageProvenance[];
  /** True when at least one image was served by the Pollinations fallback. */
  usedFallback: boolean;
  /** True when any provider in the chain experienced a failure. */
  degraded: boolean;
  /** Ordered list of providers that were attempted. */
  providersAttempted: string[];
  /** Wall-clock time of the entire generation in milliseconds. */
  totalLatencyMs: number;
  /** Provider-specific metadata (latency, info, etc.). */
  providerDetails: Record<string, { latencyMs: number; info?: string }>;
}

/** Options for a single `generate()` call. */
export interface GenerateOptions {
  /** How many images to produce (default 1). */
  count?: number;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

/* ------------------------------------------------------------------ *
 * Orchestrator
 * ------------------------------------------------------------------ */

export class GeneratorOrchestrator {
  /**
   * @param providers   Ordered list of provider adapters to try in sequence.
   *                    Each provider that uses API keys should be paired
   *                    with a KeyRotator.
   * @param rotators    Map of provider name → KeyRotator.  Only required for
   *                    providers that have API keys.
   * @param fallback    Ultimate fallback adapter — typically Pollinations
   *                    (zero auth, always available).  Defaults to a fresh
   *                    `PollinationsAdapter` if omitted.
   */
  constructor(
    private readonly providers: ImageProvider[],
    private readonly rotators: Map<string, KeyRotator> = new Map(),
    private readonly fallback: ImageProvider = new PollinationsAdapter()
  ) {}

  /**
   * Generate images through the provider chain with automatic fallback.
   *
   * Strategy:
   *   For each image slot (1..count):
   *     1. Try each provider in order.
   *     2. On rate-limit / quota / auth errors, rotate the key via the
   *        rotator and retry the same provider.
   *     3. On AllKeysExhaustedError, move to the next provider.
   *     4. If ALL providers fail for a slot, use the Pollinations fallback.
   *     5. Single-image requests that fail completely throw; batch requests
   *        return partial results with `degraded: true`.
   */
  async generate(
    params: GenerateParams,
    options?: GenerateOptions
  ): Promise<GenerationReport> {
    const t0 = performance.now();
    const count = options?.count ?? params.count ?? 1;
    const signal = options?.signal;

    const images: ImageProvenance[] = [];
    const providerDetails: Record<string, { latencyMs: number; info?: string }> = {};
    const providersAttempted: string[] = [];
    let usedFallback = false;
    let anyDegraded = false;

    // Parallel batch — generate each image slot independently so a slow
    // provider doesn't block the entire batch
    const slots = Array.from({ length: count }, (_, i) => i);

    const slotResults = await Promise.allSettled(
      slots.map(async (slotIndex) => {
        const seed = params.seed !== undefined ? params.seed + slotIndex : undefined;

        for (const provider of this.providers) {
          if (!providersAttempted.includes(provider.name)) {
            providersAttempted.push(provider.name);
          }

          if (!provider.isAvailable()) {
            continue;
          }

          try {
            const result = await provider.generate(
              { ...params, seed, count: 1 },
              signal
            );

            // Collect provider detail
            if (!providerDetails[provider.name]) {
              providerDetails[provider.name] = { latencyMs: 0 };
            }
            providerDetails[provider.name].latencyMs = Math.max(
              providerDetails[provider.name].latencyMs,
              result.latencyMs
            );
            if (result.info) {
              providerDetails[provider.name].info = result.info;
            }

            if (result.images.length > 0) {
              const meta: ProviderMeta = {};
              if (result.model) meta.model = result.model;
              if (result.degraded) meta.degraded = result.degraded;
              if (result.info) meta.info = result.info;

              return {
                url: result.images[0],
                provider: provider.name,
                fromFallback: false,
                meta,
              } satisfies ImageProvenance;
            }

            // Provider returned 200 but no images — try next provider
            continue;
          } catch (e: unknown) {
            anyDegraded = true;

            // Attempt key rotation
            const rotator = this.rotators.get(provider.name);
            if (rotator) {
              try {
                if (
                  isRateLimitError(e) ||
                  isQuotaExceededError(e) ||
                  isProviderAuthError(e)
                ) {
                  rotator.rotate();
                  // Retry the same provider with the next key
                  continue;
                }
              } catch (rotateError) {
                if (isAllKeysExhaustedError(rotateError)) {
                  // All keys for this provider are done — fall through
                  // to the next provider
                  continue;
                }
              }
            }

            // Non-key errors or provider that doesn't have a rotator:
            // move to next provider
            continue;
          }
        }

        // All providers exhausted for this slot — use Pollinations fallback
        anyDegraded = true;
        usedFallback = true;

        try {
          const fallbackResult = await this.fallback.generate(
            { ...params, seed, count: 1 },
            signal
          );

          if (fallbackResult.images.length > 0) {
            return {
              url: fallbackResult.images[0],
              provider: this.fallback.name,
              fromFallback: true,
              meta: { info: fallbackResult.info },
            } satisfies ImageProvenance;
          }
        } catch {
          // Fallback also failed — return a placeholder
        }

        // Absolute worst case: no provider could serve this slot
        return {
          url: "",
          provider: "none",
          fromFallback: true,
          meta: { info: "All providers including fallback failed" },
        } satisfies ImageProvenance;
      })
    );

    // Collect results
    for (const result of slotResults) {
      if (result.status === "fulfilled") {
        images.push(result.value);
      } else {
        anyDegraded = true;
        images.push({
          url: "",
          provider: "error",
          fromFallback: true,
          meta: { info: `Slot failed: ${result.reason?.message || "unknown error"}` },
        });
      }
    }

    const totalLatencyMs = Math.round(performance.now() - t0);

    return {
      images,
      usedFallback,
      degraded: anyDegraded,
      providersAttempted,
      totalLatencyMs,
      providerDetails,
    };
  }
}
