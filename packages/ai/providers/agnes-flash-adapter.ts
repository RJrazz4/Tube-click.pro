/**
 * Phase 3 — AgnesFlashAdapter
 *
 * Premium tier: wraps a configurable image-generation API with key rotation.
 * When a key is rate-limited or exhausted the adapter rotates to the next key
 * via its `KeyRotator`.  The orchestrator catches `AllKeysExhaustedError` and
 * falls through to the next provider.
 *
 * Configuration (environment variables):
 *   AGNES_FLASH_API_URL      — base endpoint (default see constant below)
 *   AGNES_FLASH_API_KEYS     — comma-separated list of API keys
 *   AGNES_FLASH_MODEL        — model identifier override
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
} from "./types.js";
import { KeyRotator } from "./key-rotator.js";

const DEFAULT_API_URL = "https://api.agnesflash.io/v1/images/generations";
const DEFAULT_MODEL = "agnes-flash-v2";

/** Resolve env vars safely (works in both Vercel Edge `process.env` and Deno). */
function env(key: string, fallback = ""): string {
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return process.env[key]!;
  }
  // @ts-ignore — Deno global for Supabase Edge compatibility
  if (typeof Deno !== "undefined" && Deno.env?.get) {
    // @ts-ignore
    return Deno.env.get(key) || fallback;
  }
  return fallback;
}

function envKeys(key: string): string[] {
  const raw = env(key, "").trim();
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export class AgnesFlashAdapter implements ImageProvider {
  readonly name = "agnes-flash";

  private readonly apiUrl: string;
  private readonly model: string;
  private readonly rotator: KeyRotator;

  constructor() {
    this.apiUrl = env("AGNES_FLASH_API_URL", DEFAULT_API_URL);
    this.model = env("AGNES_FLASH_MODEL", DEFAULT_MODEL);

    const keys = envKeys("AGNES_FLASH_API_KEYS");
    // If no keys configured, throw a clear config error early
    if (!keys.length) {
      throw new Error(
        "AgnesFlashAdapter: AGNES_FLASH_API_KEYS is empty or not set. " +
          "Provide at least one API key in the environment variables."
      );
    }
    this.rotator = new KeyRotator("agnes-flash", keys);
  }

  isAvailable(): boolean {
    return this.rotator.available > 0;
  }

  async generate(
    params: GenerateParams,
    signal?: AbortSignal
  ): Promise<GenerateResult & Partial<ProviderMeta>> {
    const t0 = performance.now();

    const count = params.count ?? 1;
    const body = {
      model: this.model,
      prompt: params.prompt,
      n: count,
      size: `${params.width}x${params.height}`,
      ...(params.seed !== undefined ? { seed: params.seed } : {}),
    };

    let lastError: Error | null = null;

    // Try keys until one works or all are exhausted
    for (let attempt = 0; attempt < this.rotator.total; attempt++) {
      const key = this.rotator.current;

      try {
        const res = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(body),
          signal,
        });

        const latencyMs = Math.round(performance.now() - t0);

        if (res.ok) {
          const data = await res.json();
          const images = extractImageUrls(data);
          if (images.length === 0) {
            throw new ProviderUnavailableError(
              "AgnesFlash returned 200 but no images in response"
            );
          }
          this.rotator.reset();
          return { images, provider: this.name, latencyMs };
        }

        // Classify the HTTP error
        if (res.status === 429) {
          const retryAfter = parseRetryAfter(res);
          this.rotator.rotate(); // rotate to next key
          throw new RateLimitError(
            `AgnesFlash rate-limited on key #${this.rotator.total - this.rotator.available + 1}`,
            retryAfter
          );
        }

        if (res.status === 402 || res.status === 403) {
          this.rotator.rotate(); // credits exhausted or forbidden → rotate
          continue; // try next key
        }

        if (res.status === 401) {
          this.rotator.rotate(); // invalid key → rotate
          continue;
        }

        if (res.status >= 500) {
          // Upstream error — one retry on same key, then rotate
          if (attempt === 0) {
            // brief backoff then retry same key
            await sleep(1000);
            attempt--; // retry same key
            continue;
          }
          this.rotator.rotate();
          continue;
        }

        // Non-retryable 4xx
        const errBody = await res.text().catch(() => "");
        throw new ProviderUnavailableError(
          `AgnesFlash HTTP ${res.status}: ${errBody.slice(0, 200)}`
        );
      } catch (e: any) {
        // If it's already one of our typed errors, re-throw after rotation
        if (
          e instanceof RateLimitError ||
          e instanceof QuotaExceededError ||
          e instanceof ProviderAuthError
        ) {
          throw e;
        }
        // For unexpected errors, rotate key and try again
        if (this.rotator.tryRotate()) {
          lastError = e;
          continue;
        }
        // All keys exhausted
        throw e;
      }
    }

    // All keys exhausted
    const latencyMs = Math.round(performance.now() - t0);
    return {
      images: [],
      provider: this.name,
      latencyMs,
      info: "All AgnesFlash API keys exhausted",
    };
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function extractImageUrls(data: any): string[] {
  if (Array.isArray(data?.data)) {
    return data.data.map((item: any) => item?.url).filter(Boolean);
  }
  if (Array.isArray(data?.images)) {
    return data.images.map((item: any) => item?.url || item).filter(Boolean);
  }
  if (typeof data?.url === "string") return [data.url];
  return [];
}

function parseRetryAfter(res: Response): number | undefined {
  const val = res.headers.get("retry-after") || res.headers.get("Retry-After");
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return !Number.isNaN(n) && n > 0 ? n : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
