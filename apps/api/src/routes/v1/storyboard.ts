/**
 * Phase 4 — POST /v1/storyboard
 *
 * Main storyboard generation endpoint.
 *
 * Flow:
 *   1. Parse & validate the request body.
 *   2. Enforce tier limits (scene count, brand access).
 *   3. Build scene prompts from the validated input.
 *   4. Delegate to the GeneratorOrchestrator (Phase 3) for each scene.
 *   5. Shape the response (truncated fields, provider provenance).
 *
 * Integrates with:
 *   - Phase 3: GeneratorOrchestrator / provider adapters
 *   - Phase 4: Tier middleware, validation schemas
 *   - Existing: storyboard analysis (for script-derived scenes)
 */

import { GeneratorOrchestrator } from "../../../../../packages/ai/generator";
import { AgnesFlashAdapter } from "../../../../../packages/ai/providers/agnes-flash-adapter";
import { GeminiFlashAdapter } from "../../../../../packages/ai/providers/gemini-flash-adapter";
import { PollinationsAdapter } from "../../../../../packages/ai/providers/pollinations-adapter";
import { KeyRotator } from "../../../../../packages/ai/providers/key-rotator";
import type { ImageProvider } from "../../../../../packages/ai/providers/types";
import { getTierLimits } from "../../../../../packages/shared/tier";

import {
  validateStoryboardRequest,
  type StoryboardRequest,
  type SceneInput,
} from "../validation/storyboard";
import {
  enforceStoryboardTier,
  tierFromRequest,
} from "../middleware/tier";
import {
  ok,
  badRequest,
  serverError,
  handleOptions,
  parseBody,
  aspectRatioToDimensions,
  corsHeaders,
} from "../shared";

// ─── Lazy singleton: providers / orchestrator ─────────────────────
// Constructed once per cold start, reused across invocations.

let _orchestrator: GeneratorOrchestrator | null = null;
let _providers: ImageProvider[] = [];

function getProviders(): ImageProvider[] {
  if (_providers.length > 0) return _providers;

  const loaded: ImageProvider[] = [];

  // Attempt to load authenticated providers (gracefully handle missing env)
  try {
    loaded.push(new AgnesFlashAdapter());
  } catch {
    // AgnesFlash not configured — skip
    console.info("[storyboard] AgnesFlashAdapter not configured, skipping");
  }

  try {
    loaded.push(new GeminiFlashAdapter());
  } catch {
    console.info("[storyboard] GeminiFlashAdapter not configured, skipping");
  }

  _providers = loaded;
  return _providers;
}

function getOrchestrator(): GeneratorOrchestrator {
  if (_orchestrator) return _orchestrator;

  const providers = getProviders();
  const fallback = new PollinationsAdapter();

  // Build key rotators for authenticated providers
  const rotators = new Map<string, KeyRotator>();
  // Rotators are owned by the adapter instances — the orchestrator
  // just needs a reference for the KeyRotator.get() call in its loop.
  // We attach them manually here.
  // NOTE: In a full DI setup this would be cleaner, but the adapters
  // already handle rotation internally. The orchestrator's rotator map
  // is used for the external rotation trigger. For now, we rely on the
  // adapters' internal KeyRotator + the orchestrator's fallback logic.

  _orchestrator = new GeneratorOrchestrator(providers, rotators, fallback);
  return _orchestrator;
}

// ─── Handler ─────────────────────────────────────────────────────

export async function handleStoryboardV1(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  // 1. Parse body
  const raw = await parseBody(req);
  if (!raw) {
    return badRequest("Request body is required");
  }

  // 2. Validate
  const { data, errors } = validateStoryboardRequest(raw);
  if (errors) {
    return badRequest("Validation failed", errors);
  }

  const input: StoryboardRequest = data;

  // 3. Resolve tier
  const tier = tierFromRequest(req.headers, input.tier);
  const limits = getTierLimits(tier);

  // 4. Enforce tier limits
  const enforcement = enforceStoryboardTier(tier, input.scenes.length, input.brand);

  // Truncate scenes if needed
  let scenes: SceneInput[];
  if (enforcement.corrections?.sceneCount !== undefined) {
    scenes = input.scenes.slice(0, enforcement.corrections.sceneCount);
  } else {
    scenes = input.scenes;
  }

  // Downgrade brand if needed
  const brand = enforcement.corrections?.brand || input.brand;

  // 5. Build dimensions from aspect ratio
  const dims = aspectRatioToDimensions(input.aspect_ratio);

  // 6. Generate images via orchestrator
  const orchestrator = getOrchestrator();
  const seedBase = input.seed ?? Math.floor(Math.random() * 999_999);

  // Generate each scene's image
  const sceneResults = await Promise.all(
    scenes.map(async (scene, index) => {
      const prompt = scene.visual_prompt;
      const seed = seedBase + scene.scene_number;

      const report = await orchestrator.generate(
        {
          prompt,
          width: dims.width,
          height: dims.height,
          seed,
          count: 1,
        },
        { count: 1 }
      );

      const image = report.images[0];

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
    ...(enforcement.upgradeMessage
      ? { upgrade_message: enforcement.upgradeMessage }
      : {}),
    limits: {
      max_scenes: limits.maxScenes,
      allowed_brands: limits.allowedBrands,
    },
  };

  return ok(responsePayload);
}
