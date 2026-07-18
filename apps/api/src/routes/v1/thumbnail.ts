/**
 * Phase 4 — POST /v1/thumbnail
 *
 * Thumbnail generation endpoint with tier-based throttling.
 *
 * Flow:
 *   1. Parse & validate the request body.
 *   2. Enforce tier limits (thumbnail count, brand access).
 *   3. Delegate to the GeneratorOrchestrator (Phase 3).
 *   4. Shape the response with provider provenance.
 */

import { GeneratorOrchestrator } from "../../../../../packages/ai/generator";
import { AgnesFlashAdapter } from "../../../../../packages/ai/providers/agnes-flash-adapter";
import { GeminiFlashAdapter } from "../../../../../packages/ai/providers/gemini-flash-adapter";
import { PollinationsAdapter } from "../../../../../packages/ai/providers/pollinations-adapter";
import { KeyRotator } from "../../../../../packages/ai/providers/key-rotator";
import type { ImageProvider } from "../../../../../packages/ai/providers/types";

import {
  validateThumbnailRequest,
  type ThumbnailRequest,
} from "../validation/thumbnail";
import {
  enforceThumbnailTier,
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

// ─── Lazy singleton ──────────────────────────────────────────────

let _orchestrator: GeneratorOrchestrator | null = null;
let _providers: ImageProvider[] = [];

function getProviders(): ImageProvider[] {
  if (_providers.length > 0) return _providers;

  const loaded: ImageProvider[] = [];

  try {
    loaded.push(new AgnesFlashAdapter());
  } catch {
    console.info("[thumbnail] AgnesFlashAdapter not configured, skipping");
  }

  try {
    loaded.push(new GeminiFlashAdapter());
  } catch {
    console.info("[thumbnail] GeminiFlashAdapter not configured, skipping");
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
  const { data, errors } = validateThumbnailRequest(raw);
  if (errors) {
    return badRequest("Validation failed", errors);
  }

  const input: ThumbnailRequest = data;

  // 3. Resolve tier
  const tier = tierFromRequest(req.headers, input.tier);

  // 4. Enforce tier limits
  const enforcement = enforceThumbnailTier(tier, input.count, input.brand);
  const count = enforcement.corrections?.thumbnailCount ?? input.count;
  const brand = enforcement.corrections?.brand ?? input.brand;

  // 5. Build dimensions
  const dims = aspectRatioToDimensions(input.aspect_ratio);

  // 6. Generate thumbnails
  const orchestrator = getOrchestrator();
  const seedBase = input.seed ?? Math.floor(Math.random() * 999_999);

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

  // 7. Shape response
  const thumbnails = report.images.map((img, idx) => ({
    index: idx + 1,
    url: img.url,
    provider: img.provider,
    from_fallback: img.fromFallback,
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
    ...(enforcement.upgradeMessage
      ? { upgrade_message: enforcement.upgradeMessage }
      : {}),
    degraded: report.degraded,
    providers_attempted: report.providersAttempted,
    total_latency_ms: report.totalLatencyMs,
  };

  return ok(responsePayload);
}

// ─── Prompt builder ──────────────────────────────────────────────

function buildThumbnailPrompt(
  title: string,
  emotion: string,
  style: string
): string {
  return `YouTube thumbnail: "${title}". Emotion: ${emotion}. Style: ${style}. High contrast, bold text overlay area, eye-catching, 4K, ultra-detailed, vibrant colors, cinematic lighting, professional composition.`;
}
