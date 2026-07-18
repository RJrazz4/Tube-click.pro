/**
 * Phase D4 — Circuit Breaker: per-provider health with auto-recovery.
 *
 * One circuit per provider. While CLOSED, traffic flows. Once enough
 * consecutive provider-health failures arrive (D2's cooldown-provider
 * verdicts: rate_limit / provider_unavailable / timeout), the circuit
 * OPENS and the router (C3, fed via healthMap()) stops routing there.
 * After the cooldown — a server Retry-After hint wins when longer — the
 * circuit becomes HALF-OPEN and lets a single probe through: success
 * closes it (auto-recovery), failure re-opens it with a fresh cooldown.
 *
 * What deliberately does NOT trip a circuit: quota_exceeded / auth /
 * invalid_request / unknown. Those are key-management or request-shape
 * problems — the A2 pool and the C1 KeyedLane already handled them, and
 * blaming provider health for a dead key would black-hole healthy
 * providers under the 10k-concurrency mandate.
 *
 * Everything is computed lazily from an injected clock — no timers, no
 * background state, fully deterministic under test. Instance is safe to
 * share across concurrent requests (single-threaded counters only).
 */
import {
  DEFAULT_PROVIDER_COOLDOWN_MS,
  isProviderRetryable,
  type Detection,
} from "./detector.js";
import type { ProviderErrorKind, ProviderId } from "../types/index.js";

export const BREAKER_STATES = ["closed", "open", "half-open"] as const;
export type BreakerState = (typeof BREAKER_STATES)[number];

/** Consecutive health failures before a circuit opens. */
export const DEFAULT_FAILURE_THRESHOLD = 3;

export interface CircuitBreakerOptions {
  /** Trips needed to open; default 3. */
  failureThreshold?: number;
  /** Base open → half-open window; Retry-After wins when longer. */
  cooldownMs?: number;
  now?: () => number;
}

export interface BreakerSnapshotEntry {
  provider: ProviderId;
  state: BreakerState;
  consecutiveFailures: number;
  /** Times this circuit has opened (E4/H2 metrics feed). */
  totalTrips: number;
  totalSuccesses: number;
  lastFailureKind?: ProviderErrorKind;
  openedAt?: number;
  openUntil?: number;
}

interface ProviderCircuit {
  consecutiveFailures: number;
  totalTrips: number;
  totalSuccesses: number;
  lastFailureKind?: ProviderErrorKind;
  openedAt?: number;
  openUntil?: number;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly circuits = new Map<ProviderId, ProviderCircuit>();

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD);
    this.cooldownMs = Math.max(0, options.cooldownMs ?? DEFAULT_PROVIDER_COOLDOWN_MS);
    this.now = options.now ?? Date.now;
  }

  /**
   * Effective state right now. An OPEN circuit whose cooldown has elapsed
   * reports HALF-OPEN (probe window) without mutating bookkeeping.
   */
  state(provider: ProviderId): BreakerState {
    const circuit = this.circuits.get(provider);
    if (circuit?.openUntil === undefined) return "closed";
    return this.now() < circuit.openUntil ? "open" : "half-open";
  }

  /** Router/executor gate: OPEN blocks; CLOSED and HALF-OPEN (probe) pass. */
  isRequestAllowed(provider: ProviderId): boolean {
    return this.state(provider) !== "open";
  }

  /** D3 hook — a generation succeeded through this provider. Auto-recovery. */
  recordSuccess(provider: ProviderId): void {
    const circuit = this.circuitFor(provider);
    circuit.totalSuccesses += 1;
    circuit.consecutiveFailures = 0;
    circuit.openedAt = undefined;
    circuit.openUntil = undefined;
  }

  /**
   * D3 hook — a generation failed at this provider. Only provider-health
   * kinds count toward tripping (see module doc); the detection's
   * retryAfterMs lengthens the cooldown when the server asked for more.
   */
  recordFailure(provider: ProviderId, detection?: Detection): void {
    if (detection !== undefined && !isProviderRetryable(detection.kind)) return;
    const circuit = this.circuitFor(provider);
    circuit.consecutiveFailures += 1;
    if (detection !== undefined) circuit.lastFailureKind = detection.kind;

    // A failed half-open probe re-opens immediately regardless of count.
    const was = this.state(provider);
    if (was === "half-open" || circuit.consecutiveFailures >= this.failureThreshold) {
      this.trip(circuit, detection?.retryAfterMs);
    }
  }

  /**
   * C3 health feed — drop-in for RouteContext.health:
   * open → "down", half-open → "degraded"; untouched providers omitted
   * so it spreads cleanly over caller-supplied health entries.
   */
  healthMap(): Partial<Record<ProviderId, "up" | "degraded" | "down">> {
    const health: Partial<Record<ProviderId, "up" | "degraded" | "down">> = {};
    for (const provider of this.circuits.keys()) {
      const current = this.state(provider);
      if (current === "open") health[provider] = "down";
      else if (current === "half-open") health[provider] = "degraded";
    }
    return health;
  }

  /** Snapshot for H2's /metrics — deterministic provider order. */
  snapshot(): BreakerSnapshotEntry[] {
    return [...this.circuits.entries()]
      .map(([provider, circuit]) => {
        const entry: BreakerSnapshotEntry = {
          provider,
          state: this.state(provider),
          consecutiveFailures: circuit.consecutiveFailures,
          totalTrips: circuit.totalTrips,
          totalSuccesses: circuit.totalSuccesses,
        };
        if (circuit.lastFailureKind !== undefined) entry.lastFailureKind = circuit.lastFailureKind;
        if (circuit.openedAt !== undefined) entry.openedAt = circuit.openedAt;
        if (circuit.openUntil !== undefined) entry.openUntil = circuit.openUntil;
        return entry;
      })
      .sort((a, b) => a.provider.localeCompare(b.provider));
  }

  /** Ops escape hatch: close one circuit, or all when no provider given. */
  reset(provider?: ProviderId): void {
    if (provider === undefined) this.circuits.clear();
    else this.circuits.delete(provider);
  }

  private circuitFor(provider: ProviderId): ProviderCircuit {
    let circuit = this.circuits.get(provider);
    if (circuit === undefined) {
      circuit = { consecutiveFailures: 0, totalTrips: 0, totalSuccesses: 0 };
      this.circuits.set(provider, circuit);
    }
    return circuit;
  }

  private trip(circuit: ProviderCircuit, retryAfterMs?: number): void {
    const now = this.now();
    circuit.openedAt = now;
    circuit.openUntil = now + Math.max(this.cooldownMs, retryAfterMs ?? 0);
    circuit.totalTrips += 1;
  }
}
