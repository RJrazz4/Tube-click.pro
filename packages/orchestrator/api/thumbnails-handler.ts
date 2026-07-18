/**
 * Phase F3 — POST /api/v1/thumbnails: N count-capped thumbnail options.
 *
 * Flow: F4 gate → Zod → F1 resolveThumbnailCount (400 on disallowed)
 * → N synthetic SIMPLE scenes (free-first routing, per the token-saving
 * mandate; per-scene seed variation comes free from E2's seed + index)
 * → E1 batch → E3 aggregate.
 *
 * No planner call: thumbnails are direct prompts — this endpoint costs
 * zero manager-brain tokens.
 */
import { CostTracker } from "../cost/index.js";
import {
  aggregateStoryboard,
  createSceneRunner,
  GeneratorAgent,
  GeneratorMetrics,
  mapSceneError,
  type OutcomeSink,
  type StoryboardScene,
  type StoryboardSummary,
} from "../generator/index.js";
import type { ImageProvider } from "../providers/index.js";
import { CircuitBreaker } from "../resilience/index.js";
import type { ThumbnailOption } from "../../shared/env/tier-limits.js";
import {
  ThumbnailCountNotAllowedError,
  TierPolicy,
} from "../tiers/index.js";
import type { ScenePlan, UserTier } from "../types/index.js";

import {
  thumbnailsRequestSchema,
  zodIssues,
  type ThumbnailsRequest,
} from "./schemas.js";
import {
  errorResponse,
  rateLimitGate,
  withHeaders,
  type ApiAuth,
  type ApiResponse,
  type RateLimitGate,
} from "./types.js";

export interface ThumbnailsHandlerDeps {
  policy: TierPolicy;
  providers: ReadonlyArray<ImageProvider>;
  breaker?: CircuitBreaker;
  tracker?: CostTracker;
  metrics?: GeneratorMetrics;
  agent?: GeneratorAgent;
  rateLimiter?: RateLimitGate;
  now?: () => number;
}

export interface ThumbnailsResponseBody {
  tier: UserTier;
  /** Options actually generated (the F1-resolved count). */
  count: number;
  thumbnails: StoryboardScene[];
  summary: StoryboardSummary;
}

/**
 * One synthetic scene per option. SIMPLE keeps routing free-first
 * (token mandate); "auto" defers the rest to C3. 16:9 is the YouTube
 * thumbnail canvas.
 */
export function thumbnailScene(request: ThumbnailsRequest, index: number): ScenePlan {
  return {
    index,
    title: `Thumbnail ${index + 1}`,
    prompt: request.prompt,
    negativePrompt: request.negativePrompt ?? "",
    complexity: "SIMPLE",
    aspectRatio: "16:9",
    routingHint: "auto",
  };
}

export async function handleThumbnails(
  body: unknown,
  auth: ApiAuth,
  deps: ThumbnailsHandlerDeps,
): Promise<ApiResponse> {
  const gate = rateLimitGate(auth, deps.rateLimiter);
  if (gate.deniedResponse) return gate.deniedResponse;

  const parsed = thumbnailsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return withHeaders(
      errorResponse(400, "invalid_request", "thumbnails request failed validation", zodIssues(parsed.error)),
      gate.headers,
    );
  }
  const request = parsed.data;

  let count: ThumbnailOption;
  try {
    count = deps.policy.resolveThumbnailCount(auth.tier, request.count);
  } catch (err) {
    if (err instanceof ThumbnailCountNotAllowedError) {
      return withHeaders(
        errorResponse(400, "thumbnail_count_not_allowed", err.message, {
          requested: err.requested,
          allowed: err.allowed,
        }),
        gate.headers,
      );
    }
    throw err; // programming errors stay loud
  }

  const scenes = Array.from({ length: count }, (_, index) => thumbnailScene(request, index));
  const agent = deps.agent ?? new GeneratorAgent();
  const results = await agent.generateBatch(
    scenes,
    createSceneRunner({
      tier: auth.tier,
      providers: deps.providers,
      ...(deps.breaker !== undefined ? { breaker: deps.breaker } : {}),
      ...(deps.tracker !== undefined ? { tracker: deps.tracker } : {}),
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    }),
    { mapError: mapSceneError },
  );

  const sinks: OutcomeSink[] = [];
  if (deps.tracker !== undefined) sinks.push(deps.tracker);
  if (deps.metrics !== undefined) sinks.push(deps.metrics);
  const storyboard = aggregateStoryboard(
    results,
    sinks.length > 0 ? { outcomes: sinks } : {},
  );

  const responseBody: ThumbnailsResponseBody = {
    tier: auth.tier,
    count,
    thumbnails: storyboard.scenes,
    summary: storyboard.summary,
  };
  return withHeaders({ status: 200, body: responseBody }, gate.headers);
}
