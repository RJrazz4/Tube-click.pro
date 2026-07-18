/**
 * Phase E2 — Scene Pipeline: ScenePlan → GenerationResult, never throws.
 *
 * The single-scene assembly of every subsystem built so far:
 *
 *   route (C3)     scene + user tier + LIVE breaker health → decision
 *   execute (D3)   decision chain → cascade with breaker as observer+gate
 *   breaker (D4)   healthMap feeds routing; blame/credit per verdict
 *   tracker (C4)   decision sink (route() emits it)
 *   promptsmith (Phase 1) Ingest raw Hinglish/notes → strict English prompt
 *
 * A3's contract holds absolutely here: ONE RESULT PER SCENE, ALWAYS.
 * Success carries imageUrl; failure carries a sanitized error. Even
 * RoutingImpossibleError (zero usable providers — a misconfigured
 * environment) becomes a failed result with attempts 0 instead of a
 * crash: at 10k scale, bad config must degrade into failed scenes,
 * never hang or 500 the batch.
 */
import { route, RoutingImpossibleError, type DecisionRecorder } from "../routing/index.js";
import {
  CircuitBreaker,
  executeWithFallback,
  sanitizeMessage,
} from "../resilience/index.js";
import type { ImageGenerateRequest, ImageProvider } from "../providers/index.js";
import type {
  GenerationResult,
  ProviderId,
  RoutingDecision,
  ScenePlan,
  UserTier,
} from "../types/index.js";
import type { PromptsmithService } from "../promptsmith/index.js";

export interface ScenePipelineContext {
  /** Business identity for this request's tier enforcement (F1). */
  tier: UserTier;
  /** Adapters in play — routing reads availability/health off these. */
  providers: ReadonlyArray<ImageProvider>;
  /** Live health + observer + gate for the cascade. */
  breaker?: CircuitBreaker;
  /** C4 sink for routing decisions. */
  tracker?: DecisionRecorder;
  /** Optional Promptsmith service for optimizing scene prompts before image generation. */
  promptsmith?: PromptsmithService;
  /** Max retries for primary provider with optimized prompt before falling back; default 1 when promptsmith present. */
  maxPrimaryRetries?: number;
  /**
   * Base reproducibility seed. Per-scene seed = seed + scene.index, so a
   * storyboard stays deterministic while scenes don't share one image.
   */
  seed?: number;
  /** Caller cancellation, forwarded into the provider request. */
  signal?: AbortSignal;
  now?: () => number;
}

/** Scene → provider request shape (seed fanned out per scene index). */
export function sceneToRequest(
  scene: ScenePlan,
  options: { seed?: number; signal?: AbortSignal } = {},
): ImageGenerateRequest {
  const request: ImageGenerateRequest = {
    prompt: scene.prompt,
    aspectRatio: scene.aspectRatio,
    requestTag: `scene-${scene.index}`,
  };
  if (scene.negativePrompt !== "") request.negativePrompt = scene.negativePrompt;
  if (options.seed !== undefined) request.seed = options.seed + scene.index;
  if (options.signal !== undefined) request.signal = options.signal;
  return request;
}

/**
 * Route → cascade → result. One call, one GenerationResult — the
 * per-scene runner the E1 GeneratorAgent fans out over a storyboard.
 */
export async function generateScene(
  scene: ScenePlan,
  ctx: ScenePipelineContext,
): Promise<GenerationResult> {
  const now = ctx.now ?? Date.now;
  const startedAt = now();
  const breaker = ctx.breaker;

  let promptToUse = scene.prompt;
  let negativePromptToUse = scene.negativePrompt;
  if (ctx.promptsmith !== undefined) {
    try {
      const optimized = await ctx.promptsmith.optimize({ rawInput: scene.prompt });
      promptToUse = optimized.spec.rawPrompt;
      if (optimized.spec.negativePrompts) {
        negativePromptToUse = optimized.spec.negativePrompts;
      }
    } catch {
      // Fallback to scene prompt if optimization fails
    }
  }

  const optimizedScene: ScenePlan = {
    ...scene,
    prompt: promptToUse,
    negativePrompt: negativePromptToUse,
  };

  let decision: RoutingDecision;
  try {
    decision = route(optimizedScene, {
      tier: ctx.tier,
      providers: ctx.providers,
      ...(breaker !== undefined ? { health: breaker.healthMap() } : {}),
      ...(ctx.tracker !== undefined ? { tracker: ctx.tracker } : {}),
      now,
    });
  } catch (err) {
    if (!(err instanceof RoutingImpossibleError)) throw err; // programming errors stay loud
    return {
      sceneIndex: scene.index,
      status: "failed",
      isFallback: false,
      attempts: 0,
      keyRotations: 0,
      latencyMs: now() - startedAt,
      error: sanitizeMessage(err.message),
    };
  }

  const registry = new Map<ProviderId, ImageProvider>(
    ctx.providers.map((provider) => [provider.id, provider]),
  );

  const execution = await executeWithFallback(decision, sceneToRequest(optimizedScene, ctx), {
    providers: registry,
    ...(breaker !== undefined
      ? {
          observer: breaker,
          isAllowed: (provider: ProviderId) => breaker.isRequestAllowed(provider),
        }
      : {}),
    ...(ctx.promptsmith !== undefined ? { promptsmith: ctx.promptsmith } : {}),
    ...(ctx.maxPrimaryRetries !== undefined
      ? { maxPrimaryRetries: ctx.maxPrimaryRetries }
      : { maxPrimaryRetries: ctx.promptsmith !== undefined ? 1 : 0 }),
    now,
  });
  return execution.result;
}

/**
 * E1 seam: build the per-scene runner for GeneratorAgent.generateBatch
 * plus the defensive mapError that closes A3's never-throw contract even
 * against pipeline programming errors.
 */
export function createSceneRunner(
  ctx: ScenePipelineContext,
): (scene: ScenePlan) => Promise<GenerationResult> {
  return (scene) => generateScene(scene, ctx);
}

/** Defensive slot mapper for BatchRunOptions.mapError. */
export function mapSceneError(err: unknown, scene: ScenePlan): GenerationResult {
  return {
    sceneIndex: scene.index,
    status: "failed",
    isFallback: false,
    attempts: 0,
    keyRotations: 0,
    latencyMs: 0,
    error: sanitizeMessage(
      `scene ${scene.index}: pipeline error — ${err instanceof Error ? err.message : String(err)}`,
    ),
  };
}
