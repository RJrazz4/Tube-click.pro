/**
 * Phase D3 — Cascading Fallback Executor: RoutingDecision → GenerationResult.
 *
 * Walks the C3 decision chain — primary → fallbacks → the pollinations
 * ultimate sink — converting every hop failure into a D2 verdict and
 * acting on it:
 *
 *   rotate-key / exhaust-key → retry the SAME provider in place (the C1
 *                              KeyedLane leases the next pool key), capped
 *                              at maxKeyRotations, then hop on
 *   cooldown-provider        → blame the D4 breaker, then hop
 *   next-provider            → hop NOW without blaming health — the 10k
 *                              queue-overflow escape into URL-only
 *                              Pollinations is exactly this path
 *   abort                    → stop the cascade; nothing downstream helps
 *
 * The executor NEVER throws: every path resolves into a GenerationResult
 * (success or failed) plus per-hop telemetry. Downstream phases consume:
 *   E2/E3 → the GenerationResult   E4/H2 → hops   C4 → recordOutcome(result)
 *
 * Scalability invariants: no internal state, no timers, no sleeps — safe
 * to run thousands of cascades concurrently; all waiting policy lives in
 * the C1 queues and the D4 breaker.
 */
import { detect, sanitizeMessage, type Detection, type DetectorAction } from "./detector.js";
import type {
  ImageGenerateRequest,
  ImageGenerateResult,
  ImageProvider,
} from "../providers/index.js";
import type {
  GenerationResult,
  ProviderErrorKind,
  ProviderId,
  RoutingDecision,
} from "../types/index.js";

/** One generate() call inside the cascade (key rotations repeat a provider). */
export interface FallbackHop {
  provider: ProviderId;
  /** Chain position: 0 = primary. */
  position: number;
  outcome: "success" | "failure" | "skipped";
  /** D2 verdict when outcome is "failure". */
  action?: DetectorAction;
  kind?: ProviderErrorKind;
  /** Sanitized failure summary — never key material. */
  message?: string;
  /** Wall time of this single attempt (0 when skipped). */
  latencyMs: number;
}

/** Minimal observer seam — the D4 CircuitBreaker satisfies this structurally. */
export interface AttemptObserver {
  recordSuccess(provider: ProviderId): void;
  recordFailure(provider: ProviderId, detection: Detection): void;
}

/** DI-seam types so tests (and H3's 429-simulation suites) can inject behavior. */
export type AttemptFn = (
  provider: ImageProvider,
  request: ImageGenerateRequest,
) => Promise<ImageGenerateResult>;
export type DetectionFn = (err: unknown, provider: ProviderId) => Detection;

export interface FallbackExecutorOptions {
  /** Adapters by id — full map or partial record. */
  providers:
    | ReadonlyMap<ProviderId, ImageProvider>
    | Partial<Record<ProviderId, ImageProvider>>;
  /** Pre-attempt gate: false skips the hop (D4's isRequestAllowed). */
  isAllowed?: (provider: ProviderId) => boolean;
  /** D4 breaker (or any observer) receiving blame/credit per verdict. */
  observer?: AttemptObserver;
  /** Telemetry sink — called synchronously once per hop. */
  onHop?: (hop: FallbackHop) => void;
  /** Attempt seam; defaults to provider.generate(request). */
  attempt?: AttemptFn;
  /** Detector seam; defaults to D2 detect(). */
  detect?: DetectionFn;
  /** Same-provider retries on rotate-key/exhaust-key verdicts; default 1. */
  maxKeyRotations?: number;
  now?: () => number;
}

export interface FallbackExecution {
  result: GenerationResult;
  hops: readonly FallbackHop[];
}

export async function executeWithFallback(
  decision: RoutingDecision,
  request: ImageGenerateRequest,
  options: FallbackExecutorOptions,
): Promise<FallbackExecution> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const attemptFn: AttemptFn = options.attempt ?? ((provider, req) => provider.generate(req));
  const detectFn: DetectionFn = options.detect ?? detect;
  const maxKeyRotations = Math.max(0, options.maxKeyRotations ?? 1);

  const registry = options.providers;
  const resolve = (id: ProviderId): ImageProvider | undefined => {
    if (registry instanceof Map) return registry.get(id);
    return (registry as Partial<Record<ProviderId, ImageProvider>>)[id];
  };

  const chain: ProviderId[] = [decision.providerId, ...decision.fallbacks];
  const hops: FallbackHop[] = [];
  /** generate() calls actually made; hops marked "skipped" never counted. */
  let attempts = 0;
  let keyRotations = 0;
  let lastFailure: { provider: ImageProvider; detection: Detection } | undefined;
  let result: GenerationResult | undefined;

  const emit = (hop: FallbackHop): void => {
    hops.push(hop);
    options.onHop?.(hop);
  };

  const emitFailure = (
    provider: ProviderId,
    position: number,
    detection: Detection,
    latencyMs: number,
  ): void => {
    const hop: FallbackHop = {
      provider,
      position,
      outcome: "failure",
      action: detection.action,
      kind: detection.kind,
      message: detection.message,
      latencyMs,
    };
    emit(hop);
  };

  for (let position = 0; position < chain.length && result === undefined; position += 1) {
    const providerId = chain[position];
    const provider = resolve(providerId);

    if (provider === undefined) {
      emit({ provider: providerId, position, outcome: "skipped", message: "provider not registered", latencyMs: 0 });
      continue;
    }
    if (!provider.isAvailable()) {
      emit({ provider: providerId, position, outcome: "skipped", message: "provider not available", latencyMs: 0 });
      continue;
    }
    if (options.isAllowed !== undefined && !options.isAllowed(providerId)) {
      emit({ provider: providerId, position, outcome: "skipped", message: "circuit open", latencyMs: 0 });
      continue;
    }

    // Per-provider attempt loop: rotate-key verdicts retry in place.
    let rotations = 0;
    for (;;) {
      const hopStartedAt = now();
      attempts += 1;
      try {
        const generated = await attemptFn(provider, request);
        options.observer?.recordSuccess(providerId);
        keyRotations += generated.keyRotations;
        emit({
          provider: providerId,
          position,
          outcome: "success",
          latencyMs: now() - hopStartedAt,
        });
        result = {
          sceneIndex: decision.sceneIndex,
          status: "success",
          imageUrl: generated.imageUrl,
          provider: providerId,
          costTier: provider.tier,
          isFallback: position > 0,
          attempts,
          keyRotations,
          latencyMs: now() - startedAt,
        };
        break;
      } catch (err) {
        const detection = detectFn(err, providerId);
        lastFailure = { provider, detection };
        const retrySameProvider =
          (detection.action === "rotate-key" || detection.action === "exhaust-key") &&
          rotations < maxKeyRotations;
        if (retrySameProvider) {
          // Key-level problem, NOT provider health — the lane's next lease
          // uses a fresh key; the breaker stays unblamed.
          rotations += 1;
          keyRotations += 1;
        } else if (detection.action === "cooldown-provider") {
          options.observer?.recordFailure(providerId, detection);
        }
        emitFailure(providerId, position, detection, now() - hopStartedAt);
        if (detection.action === "abort") {
          result = {
            sceneIndex: decision.sceneIndex,
            status: "failed",
            provider: providerId,
            costTier: provider.tier,
            isFallback: position > 0,
            attempts,
            keyRotations,
            latencyMs: now() - startedAt,
            error: sanitizeMessage(
              `scene ${decision.sceneIndex}: generation aborted at ${providerId} ` +
                `(${detection.kind}): ${detection.message}`,
            ),
          };
          break;
        }
        if (retrySameProvider) continue;
        break; // hop to the next chain provider
      }
    }
  }

  if (result === undefined) {
    const attemptedPastPrimary = hops.some(
      (hop) => hop.position > 0 && hop.outcome !== "skipped",
    );
    const summary =
      lastFailure === undefined
        ? `scene ${decision.sceneIndex}: no routed provider could be attempted`
        : `scene ${decision.sceneIndex}: all ${attempts} attempt(s) across ` +
          `${chain.length} provider(s) failed — last: ${lastFailure.detection.message}`;
    const failed: GenerationResult = {
      sceneIndex: decision.sceneIndex,
      status: "failed",
      isFallback: attemptedPastPrimary,
      attempts,
      keyRotations,
      latencyMs: now() - startedAt,
      error: sanitizeMessage(summary),
    };
    if (lastFailure !== undefined) {
      failed.provider = lastFailure.provider.id;
      failed.costTier = lastFailure.provider.tier;
    }
    result = failed;
  }

  return { result, hops };
}
