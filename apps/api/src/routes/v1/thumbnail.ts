/**
 * Phase 4 — POST /v1/thumbnail
 *
 * Thumbnail generation endpoint with tier-based throttling.
 * Phase 6 observability: structured logging + metrics collection.
 */

import { GeneratorOrchestrator } from "../../../../../packages/ai/generator.js";
import { AgnesFlashAdapter } from "../../../../../packages/ai/providers/agnes-flash-adapter.js";
import { GeminiFlashAdapter } from "../../../../../packages/ai/providers/gemini-flash-adapter.js";
import { PollinationsAdapter } from "../../../../../packages/ai/providers/pollinations-adapter.js";
import { KeyRotator } from "../../../../../packages/ai/providers/key-rotator.js";
import type { ImageProvider } from "../../../../../packages/ai/providers/types.js";
import { logger } from "../../../../../packages/ai/logger.js";
import { metrics } from "../../../../../packages/ai/metrics.js";

import {
  validateThumbnailRequest,
  type ThumbnailRequest,
} from "../validation/thumbnail.js";
import {
  enforceThumbnailTier,
  tierFromRequest,
} from "../middleware/tier.js";
import {
  ok,
  badRequest,
  serverError,
  handleOptions,
  parseBody,
  aspectRatioToDimensions,
  corsHeaders,
} from "../shared.js";

// ─── Lazy singleton ──────────────────────────────────────────────

let _orchestrator: GeneratorOrchestrator | null = null;
let _providers: ImageProvider[] = [];

function getProviders(): ImageProvider[] {
  if (_providers.length > 0) return _providers;

  const loaded: ImageProvider[] = [];

  try { loaded.push(new AgnesFlashAdapter()); }
  catch (e) {
    logger.warn(
      "thumbnail.providers",
      "AgnesFlashAdapter skipped — AGNES_FLASH_API_KEYS missing or invalid; thumbnails will fall back to the backup engine",
      { error: e instanceof Error ? e.message : String(e) },
    );
  }

  try { loaded.push(new GeminiFlashAdapter()); }
  catch (e) {
    logger.warn(
      "thumbnail.providers",
      "GeminiFlashAdapter skipped — GEMINI_API_KEY missing or invalid; thumbnails will fall back to the backup engine",
      { error: e instanceof Error ? e.message : String(e) },
    );
  }

  if (loaded.length === 0) {
    logger.warn(
      "thumbnail.providers",
      "No primary image providers configured — every thumbnail will be served by the backup engine. Set AGNES_FLASH_API_KEYS and/or GEMINI_API_KEY to use the primary engine.",
    );
  }

  _providers = loaded;
  return _providers;
}

function getOrchestrator(): GeneratorOrchestrator {
  if (_orchestrator) return _orchestrator;
  const providers = getProviders();
  const fallback = new PollinationsAdapter();
  _orchestrator = new GeneratorOrchestrator(providers, new Map(), fallback);
  return _orchestrator;
}

// ─── Handler ─────────────────────────────────────────────────────

export async function handleThumbnailV1(req: Request): Promise<Response> {
  const t0 = performance.now();
  metrics.increment("api.request");
  const rid = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const log = logger.child({ rid, endpoint: "v1/thumbnail" });

  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") {
    log.warn("method.not_allowed", `Method ${req.method} not allowed`);
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // 1. Parse body
  const raw = await parseBody(req);
  if (!raw) {
    log.warn("body.parse", "Request body is required");
    metrics.increment("api.error");
    return badRequest("Request body is required");
  }

  // 2. Validate
  const { data, errors } = validateThumbnailRequest(raw);
  if (errors) {
    log.warn("validation.failed", "Validation errors", { fieldCount: errors.length });
    metrics.increment("api.error");
    return badRequest("Validation failed", errors);
  }

  const input: ThumbnailRequest = data;
  log.info("request.start", "Thumbnail generation requested", {
    title: input.title.slice(0, 60),
    requestedCount: input.count,
    tier: input.tier,
    brand: input.brand,
  });

  // 3. Resolve tier
  const tier = tierFromRequest(req.headers, input.tier);

  // 4. Enforce tier limits
  const enforcement = enforceThumbnailTier(tier, input.count, input.brand);
  const count = enforcement.corrections?.thumbnailCount ?? input.count;
  const brand = enforcement.corrections?.brand ?? input.brand;

  if (count !== input.count) {
    log.info("tier.enforced", `Count clamped from ${input.count} to ${count}`, { from: input.count, to: count, tier });
    metrics.increment("tier.limit.enforced");
  }
  if (brand !== input.brand) {
    log.info("tier.enforced", `Brand downgraded from ${input.brand} to ${brand}`, { from: input.brand, to: brand, tier });
    metrics.increment("tier.limit.enforced");
  }

  // 5. Build dimensions
  const dims = aspectRatioToDimensions(input.aspect_ratio);

  // 6. Generate thumbnails
  const orchestrator = getOrchestrator();
  const seedBase = input.seed ?? Math.floor(Math.random() * 999_999);

  metrics.increment("generation.started");

  const report = await orchestrator.generate(
    {
      prompt: buildThumbnailPrompt(input.title, input.emotion, input.style),
      width: dims.width,
      height: dims.height,
      seed: seedBase,
      count,
    },
    { count }
  );

  // Track provider metrics
  for (const img of report.images) {
    if (img.provider && img.provider !== "none") {
      metrics.recordProvider(
        img.provider,
        img.url ? "success" : "failure",
        report.totalLatencyMs,
      );
    }
    // Surface the EXACT failure / fallback reason instead of swallowing it.
    if (!img.url) {
      logger.error("thumbnail.scene", "Thumbnail failed to generate", {
        provider: img.provider,
        error: img.error ?? "Generation failed",
      });
    } else if (img.fromFallback && img.error) {
      logger.warn("thumbnail.scene", "Thumbnail served by backup engine", {
        reason: img.error,
      });
    }
  }
  if (report.usedFallback) metrics.increment("fallback.used");
  if (report.degraded) metrics.increment("generation.failed");

  const successCount = report.images.filter((img) => img.url).length;
  if (successCount > 0) metrics.increment("generation.completed", successCount);
  if (report.images.length - successCount > 0) metrics.increment("generation.failed");

  const totalMs = Math.round(performance.now() - t0);
  log.info("request.complete", "Thumbnail generation completed", {
    totalMs,
    requested: input.count,
    generated: report.images.length,
    successCount,
    usedFallback: report.usedFallback,
    degraded: report.degraded,
    providersAttempted: report.providersAttempted,
  });

  // 7. Shape response
  const thumbnails = report.images.map((img, idx) => ({
    index: idx + 1,
    url: img.url,
    provider: img.provider,
    from_fallback: img.fromFallback,
    ...(img.error ? { error: img.error } : {}),
    ...(img.meta?.info ? { info: img.meta.info } : {}),
  }));

  const responsePayload = {
    title: input.title,
    emotion: input.emotion,
    style: input.style,
    aspect_ratio: input.aspect_ratio,
    tier,
    brand,
    thumbnails,
    total_generated: thumbnails.length,
    requested: input.count,
    truncated: input.count !== count,
    ...(enforcement.upgradeMessage ? { upgrade_message: enforcement.upgradeMessage } : {}),
    degraded: report.degraded,
    providers_attempted: report.providersAttempted,
    total_latency_ms: report.totalLatencyMs,
  };

  return ok(responsePayload);
}

// ─── Prompt builder ──────────────────────────────────────────────

function buildThumbnailPrompt(title: string, emotion: string, style: string): string {
  return `YouTube thumbnail: "${title}". Emotion: ${emotion}. Style: ${style}. High contrast, bold text overlay area, eye-catching, 4K, ultra-detailed, vibrant colors, cinematic lighting, professional composition.`;
}
