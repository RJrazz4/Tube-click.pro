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
import { parseImageKeyPoolsWithReport } from "../../shared/env/image-keys.js";
import { CostTracker } from "../cost/index.js";
import { GeneratorAgent, GeneratorMetrics } from "../generator/index.js";
import { ManagerService, OpenRouterClient } from "../manager/index.js";
import {
  AgnesFlashAdapter,
  GeminiFlashAdapter,
  HuggingFaceAdapter,
  TogetherAIAdapter,
  ReplicateAdapter,
  NvidiaAdapter,
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

/**
 * B4 planner, or a loud placeholder when the manager brain has no keys.
 */
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

/**
 * The C2 adapter set from A1's pools; keyed lanes share C1 queue limits.
 * Now includes explicit logging for key configuration diagnostics.
 *
 * Zero-Cost Hydra Router Adapter Order:
 *   Layer 1 (Free Keyed): HF → Together AI → Replicate
 *   Layer 2 (Free Keyless): Pollinations (ultimate fallback)
 *   Layer 3 (Premium): Agnes → Gemini
 */
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

  const adapters: ImageProvider[] = [];

  // Agnes (premium - Layer 3)
  const agnesKeys = env.imageKeyPools.agnes;
  adapters.push(new AgnesFlashAdapter({ keys: agnesKeys, queue: lane("agnes"), ...shared }));
  if (agnesKeys.length === 0) {
    console.warn("[orchestrator] Agnes adapter initialized with 0 keys - provider will be unavailable");
  } else {
    console.log(`[orchestrator] Agnes adapter initialized with ${agnesKeys.length} key(s)`);
  }

  // Gemini (premium - Layer 3)
  const geminiKeys = env.imageKeyPools.gemini;
  adapters.push(new GeminiFlashAdapter({ keys: geminiKeys, queue: lane("gemini"), ...shared }));
  if (geminiKeys.length === 0) {
    console.warn("[orchestrator] Gemini adapter initialized with 0 keys - provider will be unavailable");
  } else {
    console.log(`[orchestrator] Gemini adapter initialized with ${geminiKeys.length} key(s)`);
  }

  // HuggingFace (free - Zero-Cost Hydra Layer 1 Primary)
  const hfKeys = env.imageKeyPools.hf;
  adapters.push(new HuggingFaceAdapter({ keys: hfKeys, queue: lane("hf"), ...shared }));
  if (hfKeys.length === 0) {
    console.warn("[orchestrator] HuggingFace adapter initialized with 0 keys - provider will be unavailable (HYDRA LAYER 1 UNAVAILABLE)");
  } else {
    console.log(`[orchestrator] HuggingFace adapter initialized with ${hfKeys.length} key(s) - HYDRA LAYER 1 ACTIVE`);
  }

  // Together AI (free - Zero-Cost Hydra Layer 1 Secondary)
  const togetherKeys = env.imageKeyPools.together;
  adapters.push(new TogetherAIAdapter({ keys: togetherKeys, queue: lane("together"), ...shared }));
  if (togetherKeys.length === 0) {
    console.warn("[orchestrator] Together AI adapter initialized with 0 keys - provider will be unavailable (HYDRA LAYER 1 UNAVAILABLE)");
  } else {
    console.log(`[orchestrator] Together AI adapter initialized with ${togetherKeys.length} key(s) - HYDRA LAYER 1 ACTIVE`);
  }

  // NVIDIA NIM (free - Zero-Cost Hydra Layer 1 Tertiary)
  const nvidiaKeys = env.imageKeyPools.nvidia;
  adapters.push(new NvidiaAdapter({ keys: nvidiaKeys, queue: lane("nvidia"), ...shared }));
  if (nvidiaKeys.length === 0) {
    console.warn("[orchestrator] NVIDIA adapter initialized with 0 keys - provider will be unavailable (HYDRA LAYER 1 UNAVAILABLE)");
  } else {
    console.log(`[orchestrator] NVIDIA adapter initialized with ${nvidiaKeys.length} key(s) - HYDRA LAYER 1 ACTIVE`);
  }

  // Replicate (free - Zero-Cost Hydra Layer 1 Quaternary)
  const replicateKeys = env.imageKeyPools.replicate;
  adapters.push(new ReplicateAdapter({ keys: replicateKeys, queue: lane("replicate"), ...shared }));
  if (replicateKeys.length === 0) {
    console.warn("[orchestrator] Replicate adapter initialized with 0 keys - provider will be unavailable (HYDRA LAYER 1 UNAVAILABLE)");
  } else {
    console.log(`[orchestrator] Replicate adapter initialized with ${replicateKeys.length} key(s) - HYDRA LAYER 1 ACTIVE`);
  }

  // Pollinations (free - Zero-Cost Hydra Layer 2 Ultimate Fallback)
  adapters.push(new PollinationsAdapter({ enabled: env.pollinationsEnabled, ...shared }));
  if (env.pollinationsEnabled) {
    console.log("[orchestrator] Pollinations adapter enabled (HYDRA LAYER 2 ULTIMATE FALLBACK)");
  } else {
    console.error("[orchestrator] Pollinations adapter DISABLED - NO FALLBACK AVAILABLE!");
  }

  return adapters;
}

/**
 * Log detailed key parsing diagnostics at startup.
 * This helps debug IMAGE_API_KEYS configuration issues in production.
 */
export function logKeyDiagnostics(env: AppEnv, rawImageKeys: string | undefined): void {
  const report = parseImageKeyPoolsWithReport(rawImageKeys);

  console.log("[orchestrator] 5-Engine Hydra Router diagnostic report:");
  console.log(`  - Raw IMAGE_API_KEYS length: ${report.rawLength} chars`);
  console.log(`  - Legacy groups found: ${report.groupsFound}`);
  console.log(`  - Layer 1 (Free Keyed):`);
  console.log(`    - HF keys: ${report.parsed.hf.length}`);
  console.log(`    - Together AI keys: ${report.parsed.together.length}`);
  console.log(`    - NVIDIA keys: ${report.parsed.nvidia.length}`);
  console.log(`    - Replicate keys: ${report.parsed.replicate.length}`);
  console.log(`  - Layer 3 (Premium):`);
  console.log(`    - Agnes keys: ${report.parsed.agnes.length}`);
  console.log(`    - Gemini keys: ${report.parsed.gemini.length}`);

  if (report.warnings.length > 0) {
    console.warn("[orchestrator] IMAGE_API_KEYS warnings:");
    report.warnings.forEach((w) => console.warn(`  - ${w}`));
  }

  if (report.errors.length > 0) {
    console.error("[orchestrator] IMAGE_API_KEYS parse errors:");
    report.errors.forEach((e) => console.error(`  - ${e}`));
  }

  const hasFreeKeyed = report.parsed.hf.length > 0 || report.parsed.together.length > 0 || report.parsed.nvidia.length > 0 || report.parsed.replicate.length > 0;
  const hasPremium = report.parsed.agnes.length > 0 || report.parsed.gemini.length > 0;

  if (!hasFreeKeyed && !hasPremium) {
    console.error("[orchestrator] CRITICAL: No API keys configured! All requests will fail unless POLLINATIONS_ENABLED=true");
  } else if (!hasFreeKeyed) {
    console.warn("[orchestrator] WARNING: No free-tier keys configured (HF/Together/NVIDIA/Replicate). Only premium (COMPLEX scenes) will use Agnes/Gemini. Free tier will fall back to Pollinations.");
  } else {
    console.log("[orchestrator] 5-Engine Hydra Router: At least one free-tier provider available!");
  }
}

export function createOrchestratorApi(
  env: AppEnv,
  overrides: OrchestratorApiOverrides = {},
  rawImageKeys?: string,
): OrchestratorApi {
  // Log diagnostics at startup
  logKeyDiagnostics(env, rawImageKeys);

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
