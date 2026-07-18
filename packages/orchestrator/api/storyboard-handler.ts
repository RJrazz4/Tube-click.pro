/**
 * Phase F3 — POST /api/v1/storyboard: script → planned, capped, generated.
 *
 * The full assembly, in strict order (every step is a prior phase's
 * battle-tested unit):
 *
 *   F4 gate (optional limiter) → 429 before ANY expensive work
 *   Zod validation             → 400 with issue strings
 *   B4 planner                 → DirectorOutput (503 planner_unavailable)
 *   F2 applySceneCap           → truncated + remainingScenes
 *   E1 generateBatch           → per-scene results (never throws)
 *   E3 aggregateStoryboard     → sorted rows + summary; C4/E4 sinks fed
 *
 * The handler itself never throws for operational failures: failed
 * scenes arrive as failed rows inside a 200 (G renders placeholders).
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
import {
  ManagerInputError,
  type AnalyzeMeta,
  type AnalyzeResult,
} from "../manager/index.js";
import type { ImageProvider } from "../providers/index.js";
import { CircuitBreaker, sanitizeMessage } from "../resilience/index.js";
import { applySceneCap, TierPolicy } from "../tiers/index.js";
import type { CharacterProfile, UserTier } from "../types/index.js";

import { storyboardRequestSchema, zodIssues } from "./schemas.js";
import {
  errorMessage,
  errorResponse,
  rateLimitGate,
  withHeaders,
  type ApiAuth,
  type ApiResponse,
  type RateLimitGate,
} from "./types.js";

/** Minimal planner seam — B4's ManagerService satisfies it structurally. */
export interface StoryboardPlanner {
  analyzeScript(script: string, options: { tier: UserTier }): Promise<AnalyzeResult>;
}

export interface StoryboardHandlerDeps {
  policy: TierPolicy;
  planner: StoryboardPlanner;
  providers: ReadonlyArray<ImageProvider>;
  breaker?: CircuitBreaker;
  /** C4: routing decisions (via route) + outcomes (via E3 sink). */
  tracker?: CostTracker;
  /** E4: per-scene counters (via E3 sink). */
  metrics?: GeneratorMetrics;
  agent?: GeneratorAgent;
  /** F4 gate; absent = unlimited (dev/unit contexts). */
  rateLimiter?: RateLimitGate;
  now?: () => number;
}

export interface StoryboardResponseBody {
  tier: UserTier;
  /** Scenes the Manager planned (pre-cap). */
  plannedScenes: number;
  /** Scenes actually attempted (post-cap) — F2's clip. */
  generatedScenes: number;
  truncated: boolean;
  remainingScenes: number;
  characterProfile: CharacterProfile | null;
  scenes: StoryboardScene[];
  summary: StoryboardSummary;
  meta: AnalyzeMeta;
}

export async function handleStoryboard(
  body: unknown,
  auth: ApiAuth,
  deps: StoryboardHandlerDeps,
): Promise<ApiResponse> {
  // F4: deny cheaply, before a single token of LLM/provider work.
  const gate = rateLimitGate(auth, deps.rateLimiter);
  if (gate.deniedResponse) return gate.deniedResponse;

  const parsed = storyboardRequestSchema.safeParse(body);
  if (!parsed.success) {
    return withHeaders(
      errorResponse(400, "invalid_request", "storyboard request failed validation", zodIssues(parsed.error)),
      gate.headers,
    );
  }
  const request = parsed.data;

  let analyzed: AnalyzeResult;
  try {
    analyzed = await deps.planner.analyzeScript(request.script, { tier: auth.tier });
  } catch (err) {
    if (err instanceof ManagerInputError) {
      return withHeaders(
        errorResponse(400, "invalid_request", sanitizeMessage(err.message)),
        gate.headers,
      );
    }
    return withHeaders(
      errorResponse(
        503,
        "planner_unavailable",
        sanitizeMessage(`storyboard planner failed: ${errorMessage(err)}`),
      ),
      gate.headers,
    );
  }

  // F2 — tier cap. truncated/remainingScenes echo verbatim to the client.
  const truncation = applySceneCap(analyzed.output.scenes, deps.policy.limits(auth.tier));

  const agent = deps.agent ?? new GeneratorAgent();
  const results = await agent.generateBatch(
    truncation.scenes,
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

  const responseBody: StoryboardResponseBody = {
    tier: auth.tier,
    plannedScenes: analyzed.output.scenes.length,
    generatedScenes: truncation.scenes.length,
    truncated: truncation.truncated,
    remainingScenes: truncation.remainingScenes,
    characterProfile: analyzed.output.characterProfile,
    scenes: storyboard.scenes,
    summary: storyboard.summary,
    meta: analyzed.meta,
  };
  return withHeaders({ status: 200, body: responseBody }, gate.headers);
}
