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
  ProviderUnavailableError,
  AllKeysExhaustedError,
  isRateLimitError,
  isQuotaExceededError,
  isProviderAuthError,
  isAllKeysExhaustedError,
} from "./providers/types.js";
import { KeyRotator } from "./providers/key-rotator.js";
import { PollinationsAdapter } from "./providers/pollinations-adapter.js";
import { logger } from "./logger.js";

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
  /**
   * The EXACT reason this slot failed or was served by the backup engine
   * (e.g. "429 Rate Limit on agnes-flash", "Missing/invalid API Key for
   * gemini-flash"). `undefined` when the primary engine served the image
   * cleanly. Surfaced to the API + UI so provider failures are never silent.
   */
  error?: string;
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

    // Sequential slot generation — one slot at a time, with a small gap
    // between slots when generating a batch (count > 1). Fanning every slot
    // out in parallel tripped upstream rate limits and Vercel edge timeouts
    // (the "only 1 of 4 scenes loads" bug); serializing keeps us inside
    // provider quotas and the function's maxDuration budget.
    const INTER_SLOT_GAP_MS = Math.max(
      0,
      Number.parseInt(process.env.ORCH_INTER_SLOT_MS ?? "300", 10) || 300,
    );

    const sleep = (ms: number, abort?: AbortSignal): Promise<void> =>
      new Promise((resolve) => {
        if (ms <= 0) return resolve();
        const id = setTimeout(resolve, ms);
        abort?.addEventListener(
          "abort",
          () => {
            clearTimeout(id);
            resolve();
          },
          { once: true },
        );
      });

    const slots = Array.from({ length: count }, (_, i) => i);

    for (let s = 0; s < slots.length; s += 1) {
      const slotIndex = slots[s];
      if (signal?.aborted) {
        images.push({
          url: "",
          provider: "aborted",
          fromFallback: true,
          error: "Generation aborted",
          meta: { info: "Generation aborted before this slot started" },
        });
        anyDegraded = true;
        continue;
      }

      const outcome = await this.generateSlot(
        slotIndex,
        params,
        signal,
        providersAttempted,
        providerDetails,
      );
      images.push(outcome.image);
      anyDegraded = anyDegraded || outcome.degraded;
      usedFallback = usedFallback || outcome.usedFallback;

      if (slots.length > 1 && s < slots.length - 1 && INTER_SLOT_GAP_MS > 0) {
        await sleep(INTER_SLOT_GAP_MS, signal);
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

  /**
   * Generate ONE image slot through the provider chain (same key-rotation +
   * Pollinations fallback as before) but now it records the EXACT reason a
   * slot failed or fell back, logs it, and surfaces it via
   * `ImageProvenance.error` instead of swallowing it silently. Never throws.
   */
  private async generateSlot(
    slotIndex: number,
    params: GenerateParams,
    signal: AbortSignal | undefined,
    providersAttempted: string[],
    providerDetails: Record<string, { latencyMs: number; info?: string }>,
  ): Promise<{ image: ImageProvenance; degraded: boolean; usedFallback: boolean }> {
    const seed = params.seed !== undefined ? params.seed + slotIndex : undefined;
    let slotDegraded = false;
    let slotUsedFallback = false;
    let lastError: string | undefined;

    for (const provider of this.providers) {
      if (!providersAttempted.includes(provider.name)) {
        providersAttempted.push(provider.name);
      }
      if (!provider.isAvailable()) {
        continue;
      }

      try {
        const result = await provider.generate({ ...params, seed, count: 1 }, signal);

        if (!providerDetails[provider.name]) {
          providerDetails[provider.name] = { latencyMs: 0 };
        }
        providerDetails[provider.name].latencyMs = Math.max(
          providerDetails[provider.name].latencyMs,
          result.latencyMs,
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
            image: {
              url: result.images[0],
              provider: provider.name,
              fromFallback: false,
              meta,
            },
            degraded: slotDegraded,
            usedFallback: false,
          };
        }

        // Provider returned 200 but no images — try next provider
        continue;
      } catch (e: unknown) {
        slotDegraded = true;
        const reason = describeProviderError(e, provider.name);
        lastError = reason;
        logger.error(
          "orchestrator.provider",
          `Primary provider ${provider.name} failed for slot ${slotIndex}`,
          { provider: provider.name, error: reason },
        );

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
              continue; // retry the same provider with the next key
            }
          } catch (rotateError) {
            if (isAllKeysExhaustedError(rotateError)) {
              continue; // all keys exhausted — fall through to next provider
            }
          }
        }

        // Non-key errors or a provider without a rotator: move on
        continue;
      }
    }

    // All providers exhausted for this slot — use Pollinations fallback
    slotDegraded = true;
    slotUsedFallback = true;

    try {
      const fallbackResult = await this.fallback.generate(
        { ...params, seed, count: 1 },
        signal,
      );

      if (fallbackResult.images.length > 0) {
        return {
          image: {
            url: fallbackResult.images[0],
            provider: this.fallback.name,
            fromFallback: true,
            // Surface WHY we fell back to the backup engine (exact reason).
            ...(lastError !== undefined ? { error: lastError } : {}),
            meta: { info: fallbackResult.info },
          },
          degraded: true,
          usedFallback: true,
        };
      }
    } catch (e: unknown) {
      const reason = describeProviderError(e, this.fallback.name);
      lastError = lastError ?? reason;
      logger.error(
        "orchestrator.fallback",
        `Backup engine ${this.fallback.name} failed for slot ${slotIndex}`,
        { provider: this.fallback.name, error: reason },
      );
    }

    // Absolute worst case: no provider could serve this slot
    return {
      image: {
        url: "",
        provider: "none",
        fromFallback: true,
        error: lastError,
        meta: { info: "All providers including fallback failed" },
      },
      degraded: true,
      usedFallback: true,
    };
  }
}

/** Human-readable, user-safe classification of a provider failure. */
function describeProviderError(e: unknown, providerName: string): string {
  if (isRateLimitError(e)) return `429 Rate Limit on ${providerName}`;
  if (isQuotaExceededError(e)) return `Quota exceeded on ${providerName}`;
  if (isProviderAuthError(e)) return `Missing/invalid API Key for ${providerName}`;
  if (e instanceof ProviderUnavailableError) {
    return `Provider unavailable (${providerName} timeout or 5xx)`;
  }
  if (e instanceof DOMException && e.name === "AbortError") {
    return `${providerName} request aborted`;
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/timeout|timed out|aborted/i.test(msg)) return `Timeout calling ${providerName}`;
  return `${providerName} error: ${msg.slice(0, 200)}`;
}
