/**
 * Phase C2 — GeminiFlashAdapter (premium).
 *
 * Google AI Studio generateContent image generation. Model default is
 * live-verified 2026-07-18: gemini-3.1-flash-image-preview. The Master
 * Plan's "gemini-3.1-flash-image-preview-free" carries an invalid
 * "-free" suffix — AI Studio free tier is account-level, not model-level.
 *
 * Response: candidates[0].content.parts[] with inlineData {mimeType,data}
 * → materialized as a data URL. Negative prompt is folded into the text
 * content (the API has no separate negative channel for image models).
 */
import { KeyedLane } from "./keyed-lane.js";
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

export const GEMINI_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_DEFAULT_MODEL = "gemini-3.1-flash-image-preview"; // live-verified 2026-07-18

export interface GeminiFlashAdapterOptions {
  keys: string[];
  baseUrl?: string;
  model?: string;
  queue?: RequestQueue;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

/** Find the first inlineData part and materialize a data URL. */
function extractInlineImage(data: unknown): string | undefined {
  if (!isRecord(data) || !Array.isArray(data.candidates)) return undefined;
  const first: unknown = data.candidates[0];
  if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) {
    return undefined;
  }
  for (const part of first.content.parts as unknown[]) {
    if (!isRecord(part)) continue;
    const inline = part.inlineData;
    if (isRecord(inline) && typeof inline.data === "string" && inline.data.length > 0) {
      const mime = typeof inline.mimeType === "string" ? inline.mimeType : "image/png";
      return `data:${mime};base64,${inline.data}`;
    }
  }
  return undefined;
}

/** A promptFeedback.blockReason means the prompt was refused (non-retryable). */
function extractBlockReason(data: unknown): string | undefined {
  if (!isRecord(data) || !isRecord(data.promptFeedback)) return undefined;
  const reason = data.promptFeedback.blockReason;
  return typeof reason === "string" ? reason : undefined;
}

export class GeminiFlashAdapter implements ImageProvider {
  readonly id = "gemini" as const;
  readonly tier = "premium" as const;
  readonly keyless = false as const;

  private readonly lane: KeyedLane | undefined;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly firstKey: string | undefined;

  constructor(options: GeminiFlashAdapterOptions) {
    this.baseUrl = options.baseUrl ?? GEMINI_DEFAULT_BASE_URL;
    this.model = options.model ?? GEMINI_DEFAULT_MODEL;
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
        timeoutMs: options.timeoutMs ?? 25_000, // image models are slower
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
        "gemini: no API keys configured (IMAGE_API_KEYS gemini:...)",
      );
    }
    const started = this.now();
    const text = request.negativePrompt
      ? `${request.prompt}\n\nAvoid: ${request.negativePrompt}`
      : request.prompt;

    const { response, keyIndex, attempts } = await this.lane.request(
      (key, signal) =>
        this.fetchImpl(
          `${this.baseUrl}/${this.model}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text }] }],
              generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig: { aspectRatio: request.aspectRatio },
              },
            }),
            signal,
          },
        ),
      request.signal,
    );

    const data: unknown = await response.json().catch(() => undefined);
    const imageUrl = extractInlineImage(data);
    if (imageUrl) {
      return {
        imageUrl,
        provider: this.id,
        urlOnly: false,
        latencyMs: this.now() - started,
        keyIndex,
        keyRotations: attempts - 1,
      };
    }
    const blockReason = extractBlockReason(data);
    if (blockReason) {
      throw new NormalizedProviderError(
        this.id,
        "invalid_request",
        `gemini: prompt blocked (${blockReason})`,
      );
    }
    throw new NormalizedProviderError(
      this.id,
      "provider_unavailable",
      "gemini: response contained no inline image",
    );
  }

  async healthCheck(): Promise<ProviderHealthReport> {
    if (!this.firstKey) {
      return { provider: this.id, state: "down", detail: "no keys configured", latencyMs: 0, checkedAt: this.now() };
    }
    return probeHealth(this.id, `${this.baseUrl}/${this.model}?key=${encodeURIComponent(this.firstKey)}`, {
      fetchImpl: this.fetchImpl,
      now: this.now,
    });
  }
}
