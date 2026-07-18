/**
 * Phase 3 — GeminiFlashAdapter
 *
 * Premium tier: wraps Google Gemini / Imagen image-generation API with key
 * rotation.  When a key is exhausted, the adapter rotates to the next key.
 * The orchestrator catches `AllKeysExhaustedError` and falls through to
 * the next provider.
 *
 * Because Gemini Flash uses per-minute and per-day quotas, the adapter
 * distinguishes between:
 *   - `RATE_LIMITED`  (per-minute → rotate key, server-hinted `retryAfter`)
 *   - `QUOTA_EXCEEDED_DAILY` (per-day → rotate key — no point sleeping)
 *
 * Configuration (environment variables):
 *   GEMINI_FLASH_API_URL     — base endpoint (default Google AI Studio URL)
 *   GEMINI_API_KEYS          — comma-separated list of Gemini API keys
 *   GEMINI_FLASH_MODEL       — model identifier override
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
} from "./types";
import { KeyRotator } from "./key-rotator";

const DEFAULT_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.0-flash-exp-image-generation";

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

export class GeminiFlashAdapter implements ImageProvider {
  readonly name = "gemini-flash";

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly rotator: KeyRotator;

  constructor() {
    this.baseUrl = env("GEMINI_FLASH_API_URL", DEFAULT_API_URL);
    this.model = env("GEMINI_FLASH_MODEL", DEFAULT_MODEL);

    const keys = envKeys("GEMINI_API_KEYS");
    if (!keys.length) {
      throw new Error(
        "GeminiFlashAdapter: GEMINI_API_KEYS is empty or not set. " +
          "Provide at least one Gemini API key in the environment variables."
      );
    }
    this.rotator = new KeyRotator("gemini-flash", keys);
  }

  isAvailable(): boolean {
    return this.rotator.available > 0;
  }

  /**
   * Generate images via the Gemini API.
   *
   * Gemini's image-generation endpoint is a `generateContent` call with
   * `responseModalities: ["Image", "Text"]`.  The response contains
   * base64-encoded inline images which we return as data URIs so the
   * calling orchestrator can forward them as needed.
   */
  async generate(
    params: GenerateParams,
    signal?: AbortSignal
  ): Promise<GenerateResult & Partial<ProviderMeta>> {
    const t0 = performance.now();
    const count = params.count ?? 1;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: params.prompt }],
        },
      ],
      generationConfig: {
        temperature: 1.0,
        topK: 32,
        topP: 1,
        maxOutputTokens: 8192,
        responseModalities: ["Image", "Text"],
        ...(params.seed !== undefined ? { seed: params.seed } : {}),
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.rotator.total; attempt++) {
      const key = this.rotator.current;
      const url = `${this.baseUrl}/${this.model}:generateContent?key=${key}`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal,
        });

        const latencyMs = Math.round(performance.now() - t0);

        if (res.ok) {
          const data = await res.json();
          const images = extractGeminiImages(data);

          if (images.length === 0) {
            // Gemini may return text-only response if blocked
            const text = extractGeminiText(data);
            if (text) {
              return {
                images: [],
                provider: this.name,
                latencyMs,
                info: `Gemini returned text response (content may have been filtered): ${text.slice(0, 120)}`,
              };
            }
            throw new ProviderUnavailableError(
              "Gemini returned 200 but no image data in response"
            );
          }

          this.rotator.reset();
          return {
            images: images.slice(0, count),
            provider: this.name,
            latencyMs,
          };
        }

        // Error classification
        const errBody = await res.text().catch(() => "");
        const parsed = safeParseJson(errBody);
        const errMessage =
          parsed?.error?.message || parsed?.message || errBody;

        if (res.status === 429) {
          const retryAfter = parseRetryAfter(res);
          const isDaily = /per.?day|daily|day.?quota|quota.?exceed/i.test(
            errMessage + JSON.stringify(parsed?.error?.details || [])
          );
          this.rotator.rotate();

          if (isDaily) {
            throw new QuotaExceededError(
              `Gemini Flash daily quota exceeded on key #${this.rotator.total - this.rotator.available}`
            );
          }
          throw new RateLimitError(
            `Gemini Flash rate-limited on key #${this.rotator.total - this.rotator.available + 1}`,
            retryAfter
          );
        }

        if (res.status === 403 || res.status === 401) {
          this.rotator.rotate(); // invalid / revoked key
          continue;
        }

        if (res.status >= 500) {
          // Upstream error — one brief retry on same key
          if (attempt === 0) {
            await sleep(1500);
            attempt--; // retry same key
            continue;
          }
          this.rotator.rotate();
          continue;
        }

        // Non-retryable 4xx
        throw new ProviderUnavailableError(
          `Gemini Flash HTTP ${res.status}: ${errMessage.slice(0, 200)}`
        );
      } catch (e: any) {
        if (
          e instanceof RateLimitError ||
          e instanceof QuotaExceededError ||
          e instanceof ProviderAuthError
        ) {
          throw e;
        }
        // Rotate key for unexpected errors
        if (this.rotator.tryRotate()) {
          lastError = e;
          continue;
        }
        throw e;
      }
    }

    const latencyMs = Math.round(performance.now() - t0);
    return {
      images: [],
      provider: this.name,
      latencyMs,
      info: "All Gemini Flash API keys exhausted",
    };
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function extractGeminiImages(data: any): string[] {
  const urls: string[] = [];
  const candidates = data?.candidates ?? [];
  for (const c of candidates) {
    const parts = c?.content?.parts ?? [];
    for (const p of parts) {
      if (p?.inlineData?.data && p?.inlineData?.mimeType) {
        urls.push(
          `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`
        );
      }
    }
  }
  return urls;
}

function extractGeminiText(data: any): string {
  return (data?.candidates ?? [])
    .flatMap((c: any) => c?.content?.parts ?? [])
    .map((p: any) => p?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function safeParseJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseRetryAfter(res: Response): number | undefined {
  const val = res.headers.get("retry-after") || res.headers.get("Retry-After");
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return !Number.isNaN(n) && n > 0 ? n : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
