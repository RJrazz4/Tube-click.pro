/**
 * Phase F3 — Composition root: AppEnv → mount-ready OrchestratorApi.
 *
 * One call wires every phase into the transport:
 *
 *   A1 env        → F1 policy, C2 adapters (with C1 lane queues), B4 planner
 *   C3/C4         → route-time health + decision ledger (inside E2)
 *   D4            → the shared breaker guarding every cascade
 *   E1–E4         → batch engine, pipeline, aggregation, metrics
 *   F4 (optional) → a RateLimitGate for the handlers
 *
 * Graceful-degradation guarantees (all test-locked):
 *   - no OPENROUTER keys   → planner replaced by a loud 503 stub; the
 *                            thumbnail endpoint still fully works
 *   - no provider keys     → keyed adapters report unavailable; routing
 *                            flows to Pollinations (or failed rows when
 *                            POLLINATIONS_ENABLED is off) — never a crash
 *   - pollinations-only    → zero-config working image API
 *
 * The returned object also exposes the shared breaker/tracker/metrics so
 * H2 can mount /metrics and /health without re-plumbing.
 */
import type { AppEnv } from "../../shared/env/index.js";
import { CostTracker } from "../cost/index.js";
import { GeneratorAgent, GeneratorMetrics } from "../generator/index.js";
import { ManagerService, OpenRouterClient } from "../manager/index.js";
import {
  AgnesFlashAdapter,
  GeminiFlashAdapter,
  HuggingFaceAdapter,
  PollinationsAdapter,
  RequestQueue,
  type ImageProvider,
} from "../providers/index.js";
import { CircuitBreaker } from "../resilience/index.js";
import { TierPolicy } from "../tiers/index.js";
import type { KeyedProviderId } from "../types/index.js";

import {
  handleHealth,
  handleMetrics,
  handleMetricsJson,
} from "./observability-handlers.js";

import { TierRateLimiter } from "./rate-limiter.js";
import {
  handleStoryboard,
  type StoryboardPlanner,
} from "./storyboard-handler.js";
import { handleThumbnails, type ThumbnailsHandlerDeps } from "./thumbnails-handler.js";
import { handleTiers } from "./tiers-handler.js";
import type { ApiAuth, ApiResponse, RateLimitGate } from "./types.js";

/**
 * Per-keyed-provider lane limits (C1): 2 in flight against the upstream,
 * up to 100 waiting, then instant overflow — the 10k silent-overflow
 * trigger that D2/D3 turn into Pollinations routing. Pollinations itself
 * needs no lane (URL-only, zero server fetch).
 */
export const DEFAULT_LANE_LIMITS = { concurrency: 2, maxQueue: 100 } as const;

export interface OrchestratorApiOverrides {
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Inject instead of the OpenRouter-backed B4 planner (tests/mocks). */
  planner?: StoryboardPlanner;
  /** Inject instead of the C2 adapter set (tests/mocks). */
  providers?: ReadonlyArray<ImageProvider>;
  agent?: GeneratorAgent;
  breaker?: CircuitBreaker;
  tracker?: CostTracker;
  metrics?: GeneratorMetrics;
  /** F4: per-tier limiter; absent = ungated (dev). */
  rateLimiter?: RateLimitGate;
}

export interface OrchestratorApi {
  handleStoryboard(body: unknown, auth: ApiAuth): Promise<ApiResponse>;
  handleThumbnails(body: unknown, auth: ApiAuth): Promise<ApiResponse>;
  handleTiers(): ApiResponse;
  /** H2: Prometheus text exposition. */
  handleMetrics(): ApiResponse;
  /** H2: same truth as JSON. */
  handleMetricsJson(): ApiResponse;
  /** H2: 200 ok/degraded, 503 down. */
  handleHealth(): ApiResponse;
  readonly policy: TierPolicy;
  readonly providers: ReadonlyArray<ImageProvider>;
  readonly breaker: CircuitBreaker;
  readonly tracker: CostTracker;
  readonly metrics: GeneratorMetrics;
  readonly rateLimiter: RateLimitGate | undefined;
}

/** B4 planner, or a loud placeholder when the manager brain has no keys. */
function defaultPlanner(
  env: AppEnv,
  overrides: OrchestratorApiOverrides,
): StoryboardPlanner {
  if (env.openrouterKeys.length === 0) {
    return {
      analyzeScript: () =>
        Promise.reject(
          new Error("storyboard planner not configured: set OPENROUTER_API_KEYS"),
        ),
    };
  }
  return new ManagerService({
    client: new OpenRouterClient({
      keys: env.openrouterKeys,
      ...(env.openrouterModel !== undefined ? { model: env.openrouterModel } : {}),
      ...(overrides.fetchImpl !== undefined ? { fetchImpl: overrides.fetchImpl } : {}),
      ...(overrides.now !== undefined ? { now: overrides.now } : {}),
    }),
  });
}

/** The C2 adapter set from A1's pools; keyed lanes share C1 queue limits. */
function defaultProviders(
  env: AppEnv,
  overrides: OrchestratorApiOverrides,
): ImageProvider[] {
  const lane = (id: KeyedProviderId): RequestQueue =>
    new RequestQueue(`provider:${id}`, { ...DEFAULT_LANE_LIMITS });
  const shared = {
    ...(overrides.fetchImpl !== undefined ? { fetchImpl: overrides.fetchImpl } : {}),
    ...(overrides.now !== undefined ? { now: overrides.now } : {}),
  };
  return [
    new AgnesFlashAdapter({ keys: env.imageKeyPools.agnes, queue: lane("agnes"), ...shared }),
    new GeminiFlashAdapter({ keys: env.imageKeyPools.gemini, queue: lane("gemini"), ...shared }),
    new HuggingFaceAdapter({ keys: env.imageKeyPools.hf, queue: lane("hf"), ...shared }),
    new PollinationsAdapter({ enabled: env.pollinationsEnabled, ...shared }),
  ];
}

export function createOrchestratorApi(
  env: AppEnv,
  overrides: OrchestratorApiOverrides = {},
): OrchestratorApi {
  const policy = TierPolicy.fromEnv(env);
  const breaker = overrides.breaker ?? new CircuitBreaker(
    overrides.now !== undefined ? { now: overrides.now } : {},
  );
  const tracker = overrides.tracker ?? new CostTracker();
  const metrics = overrides.metrics ?? new GeneratorMetrics();
  const agent = overrides.agent ?? new GeneratorAgent();
  const providers = overrides.providers ?? defaultProviders(env, overrides);
  const planner = overrides.planner ?? defaultPlanner(env, overrides);
  const rateLimiter = overrides.rateLimiter;

  const handlerDeps: {
    breaker: CircuitBreaker;
    tracker: CostTracker;
    metrics: GeneratorMetrics;
    agent: GeneratorAgent;
    rateLimiter?: RateLimitGate;
    now?: () => number;
  } = {
    breaker,
    tracker,
    metrics,
    agent,
    ...(rateLimiter !== undefined ? { rateLimiter } : {}),
    ...(overrides.now !== undefined ? { now: overrides.now } : {}),
  };

  // H2 read endpoints derive from the same deps as the write path.
  const nowDeps = overrides.now !== undefined ? { now: overrides.now } : {};
  const observability = {
    breaker,
    tracker,
    metrics,
    ...(rateLimiter instanceof TierRateLimiter ? { rateLimiter } : {}),
    ...nowDeps,
  };

  return {
    handleStoryboard: (body, auth) =>
      handleStoryboard(body, auth, { policy, planner, providers, ...handlerDeps }),
    handleThumbnails: (body, auth) =>
      handleThumbnails(body, auth, { policy, providers, ...handlerDeps }),
    handleTiers: () => handleTiers({ policy }),
    handleMetrics: () => handleMetrics(observability),
    handleMetricsJson: () => handleMetricsJson(observability),
    handleHealth: () => handleHealth({ breaker, metrics, providers, ...nowDeps }),
    policy,
    providers,
    breaker,
    tracker,
    metrics,
    rateLimiter,
  };
}
