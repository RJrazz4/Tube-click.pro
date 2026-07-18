/**
 * Phase 4 — POST /v1/storyboard
 *
 * Main storyboard generation endpoint with Phase 6 observability.
 *
 * Flow:
 *   1. Parse & validate the request body.
 *   2. Enforce tier limits (scene count, brand access).
 *   3. Build scene prompts from the validated input.
 *   4. Delegate to the GeneratorOrchestrator (Phase 3) for each scene.
 *   5. Shape the response (truncated fields, provider provenance).
 *   6. Log structured metrics for observability.
 *
 * Integrates with:
 *   - Phase 3: GeneratorOrchestrator / provider adapters
 *   - Phase 4: Tier middleware, validation schemas
 *   - Phase 6: Logger + Metrics collector
 */

import { GeneratorOrchestrator } from "../../../../../packages/ai/generator.js";
import { AgnesFlashAdapter } from "../../../../../packages/ai/providers/agnes-flash-adapter.js";
import { GeminiFlashAdapter } from "../../../../../packages/ai/providers/gemini-flash-adapter.js";
import { PollinationsAdapter } from "../../../../../packages/ai/providers/pollinations-adapter.js";
import { KeyRotator } from "../../../../../packages/ai/providers/key-rotator.js";
import type { ImageProvider } from "../../../../../packages/ai/providers/types.js";
import { getTierLimits } from "../../../../../packages/shared/tier.js";
import { logger } from "../../../../../packages/ai/logger.js";
import { metrics } from "../../../../../packages/ai/metrics.js";

import {
  validateStoryboardRequest,
  type StoryboardRequest,
  type SceneInput,
} from "../validation/storyboard.js";
import {
  enforceStoryboardTier,
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

// ─── Lazy singleton: providers / orchestrator ─────────────────────

let _orchestrator: GeneratorOrchestrator | null = null;
let _providers: ImageProvider[] = [];

function getProviders(): ImageProvider[] {
  if (_providers.length > 0) return _providers;

  const loaded: ImageProvider[] = [];

  try {
    loaded.push(new AgnesFlashAdapter());
  } catch {
    logger.info("storyboard.providers", "AgnesFlashAdapter not configured, skipping");
  }

  try {
    loaded.push(new GeminiFlashAdapter());
  } catch {
    logger.info("storyboard.providers", "GeminiFlashAdapter not configured, skipping");
  }

  _providers = loaded;
  return _providers;
}

function getOrchestrator(): GeneratorOrchestrator {
  if (_orchestrator) return _orchestrator;

  const providers = getProviders();
  const fallback = new PollinationsAdapter();
  const rotators = new Map<string, KeyRotator>();

  _orchestrator = new GeneratorOrchestrator(providers, rotators, fallback);
  return _orchestrator;
}

// ─── Handler ─────────────────────────────────────────────────────

export async function handleStoryboardV1(req: Request): Promise<Response> {
  const t0 = performance.now();
  metrics.increment("api.request");
  const rid = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const log = logger.child({ rid, endpoint: "v1/storyboard" });

  // CORS preflight
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") {
    log.warn("method.not_allowed", `Method ${req.method} not allowed`);
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  // 1. Parse body
  const raw = await parseBody(req);
  if (!raw) {
    log.warn("body.parse", "Request body is required");
    metrics.increment("api.error");
    return badRequest("Request body is required");
  }

  // 2. Validate
  const { data, errors } = validateStoryboardRequest(raw);
  if (errors) {
    log.warn("validation.failed", "Validation errors", { fieldCount: errors.length, firstField: errors[0]?.field });
    metrics.increment("api.error");
    return badRequest("Validation failed", errors);
  }

  const input: StoryboardRequest = data;
  log.info("request.start", "Storyboard generation requested", {
    topic: input.topic.slice(0, 80),
    sceneCount: input.scenes.length,
    tier: input.tier,
    brand: input.brand,
  });

  // 3. Resolve tier
  const tier = tierFromRequest(req.headers, input.tier);
  const limits = getTierLimits(tier);

  // 4. Enforce tier limits
  const enforcement = enforceStoryboardTier(tier, input.scenes.length, input.brand);

  let scenes: SceneInput[];
  if (enforcement.corrections?.sceneCount !== undefined) {
    scenes = input.scenes.slice(0, enforcement.corrections.sceneCount);
    log.info("tier.enforced", `Scenes truncated from ${input.scenes.length} to ${scenes.length}`, {
      from: input.scenes.length,
      to: scenes.length,
      tier,
    });
    metrics.increment("tier.limit.enforced");
  } else {
    scenes = input.scenes;
  }

  const brand = enforcement.corrections?.brand || input.brand;
  if (enforcement.corrections?.brand) {
    log.info("tier.enforced", `Brand downgraded from ${input.brand} to ${brand}`, {
      from: input.brand,
      to: brand,
      tier,
    });
    metrics.increment("tier.limit.enforced");
  }

  // 5. Build dimensions
  const dims = aspectRatioToDimensions(input.aspect_ratio);
  metrics.increment("generation.started");

  // 6. Generate images
  const orchestrator = getOrchestrator();
  const seedBase = input.seed ?? Math.floor(Math.random() * 999_999);

  const sceneResults = await Promise.all(
    scenes.map(async (scene) => {
      const prompt = scene.visual_prompt;
      const seed = seedBase + scene.scene_number;

      const report = await orchestrator.generate(
        { prompt, width: dims.width, height: dims.height, seed, count: 1 },
        { count: 1 }
      );

      const image = report.images[0];

      // Track provider metrics
      if (image?.provider && image.provider !== "none") {
        if (image.fromFallback) {
          metrics.increment("fallback.used");
        }
        metrics.recordProvider(
          image.provider,
          image.url ? "success" : "failure",
          report.totalLatencyMs
        );
      }

      if (report.usedFallback) metrics.increment("fallback.used");
      if (report.degraded) metrics.increment("generation.failed");

      return {
        scene_number: scene.scene_number,
        image_url: image?.url || "",
        provider: image?.provider || "none",
        from_fallback: image?.fromFallback ?? true,
        duration: scene.duration,
        transition: scene.transition,
        beat_type: scene.beat_type,
        degraded: report.degraded,
      };
    })
  );

  const totalMs = Math.round(performance.now() - t0);
  const successCount = sceneResults.filter((s) => s.image_url).length;
  const failCount = sceneResults.length - successCount;

  if (successCount > 0) metrics.increment("generation.completed", successCount);
  if (failCount > 0) metrics.increment("generation.failed", failCount);

  log.info("request.complete", "Storyboard generation completed", {
    totalMs,
    totalScenes: sceneResults.length,
    successCount,
    failCount,
    usedFallback: sceneResults.some((s) => s.from_fallback),
    degraded: sceneResults.some((s) => s.degraded),
  });

  // 7. Shape response
  const responsePayload = {
    topic: input.topic,
    tier,
    brand,
    aspect_ratio: input.aspect_ratio,
    scenes: sceneResults,
    total_scenes: sceneResults.length,
    requested_scenes: input.scenes.length,
    truncated: input.scenes.length !== sceneResults.length,
    ...(enforcement.upgradeMessage ? { upgrade_message: enforcement.upgradeMessage } : {}),
    limits: {
      max_scenes: limits.maxScenes,
      allowed_brands: limits.allowedBrands,
    },
  };

  return ok(responsePayload);
}
