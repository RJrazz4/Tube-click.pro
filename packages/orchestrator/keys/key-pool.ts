/**
 * Phase A2 — KeyPool: one provider's API keys with rotation + health tracking.
 *
 * Semantics (foundation for Master Plan D: Advanced Key Rotation):
 *   - getNextKey()     round-robin across AVAILABLE keys; a handout counts
 *                      as a use (attempt) — outcomes land via
 *                      recordSuccess / recordFailure
 *   - markExhausted()  quota-dead (429/quota semantics); skipped until reset()
 *   - recordFailure()  may impose a cooldown (temporary backoff, D4)
 *   - reset()          new billing cycle — clears exhaustion, cooldowns,
 *                      counters, and the rotation cursor
 *
 * The clock is injectable (`now`) so cooldown behavior is deterministically
 * testable; snapshots never expose raw key material.
 */
import { maskKey } from "../../shared/env/index.js";

import { AllKeysExhaustedError, UnknownKeyError } from "./errors.js";

/** A key handed out by getNextKey — report outcomes against `.key`. */
export interface KeyLease {
  key: string;
  index: number;
}

export type KeyStatus = "available" | "cooldown" | "exhausted";

/** Redacted per-key health view for metrics, logging, and debugging UIs. */
export interface KeyHealth {
  keyIndex: number;
  maskedKey: string;
  uses: number;
  successes: number;
  failures: number;
  consecutiveFailures: number;
  status: KeyStatus;
  cooldownUntil?: number;
  exhaustedAt?: number;
  exhaustReason?: string;
}

export interface KeyPoolOptions {
  /** Provider label used in errors and snapshots (e.g. "agnes"). */
  provider: string;
  /** Clock injection for deterministic cooldown tests. Default Date.now. */
  now?: () => number;
}

export interface RecordFailureOptions {
  /** Temporary backoff in ms; the key is skipped until the deadline passes. */
  cooldownMs?: number;
}

interface KeyState {
  key: string;
  uses: number;
  successes: number;
  failures: number;
  consecutiveFailures: number;
  exhaustedAt: number | undefined;
  exhaustReason: string | undefined;
  cooldownUntil: number | undefined;
}

export class KeyPool {
  readonly provider: string;

  private readonly states: KeyState[];
  private readonly now: () => number;
  /** Index of the key handed out most recently (-1 before first handout). */
  private cursor = -1;

  constructor(keys: string[], options: KeyPoolOptions) {
    const deduped = [...new Set(keys.map((k) => k.trim()).filter((k) => k.length > 0))];
    if (deduped.length === 0) {
      throw new Error(`KeyPool("${options.provider}"): at least one key is required`);
    }
    this.provider = options.provider;
    this.now = options.now ?? Date.now;
    this.states = deduped.map((key) => ({
      key,
      uses: 0,
      successes: 0,
      failures: 0,
      consecutiveFailures: 0,
      exhaustedAt: undefined,
      exhaustReason: undefined,
      cooldownUntil: undefined,
    }));
  }

  /** Total distinct keys managed. */
  get size(): number {
    return this.states.length;
  }

  /** Keys currently usable (not exhausted, not cooling down). */
  get availableCount(): number {
    return this.states.filter((s) => this.statusOf(s) === "available").length;
  }

  /**
   * Next available key in round-robin order.
   * @throws {AllKeysExhaustedError} when no key is usable; carries
   *         retryAfterMs when cooldowns (not hard exhaustion) are the cause.
   */
  getNextKey(): KeyLease {
    const n = this.states.length;
    for (let step = 1; step <= n; step++) {
      const index = (this.cursor + step + n) % n;
      const state = this.states[index];
      if (this.statusOf(state) === "available") {
        this.cursor = index;
        state.uses += 1;
        return { key: state.key, index };
      }
    }
    throw new AllKeysExhaustedError(this.provider, { retryAfterMs: this.nextCooldownRetryMs() });
  }

  /** Mark a key quota-dead; skipped until {@link reset}. Idempotent. */
  markExhausted(key: string, reason?: string): void {
    const state = this.requireState(key);
    if (state.exhaustedAt !== undefined) return;
    state.exhaustedAt = this.now();
    state.exhaustReason = reason;
  }

  /** Record a successful call; clears the consecutive-failure streak. */
  recordSuccess(key: string): void {
    const state = this.requireState(key);
    state.successes += 1;
    state.consecutiveFailures = 0;
  }

  /**
   * Record a failed call. With `cooldownMs` the key is temporarily skipped
   * (a later deadline always wins over an earlier one).
   */
  recordFailure(key: string, options: RecordFailureOptions = {}): void {
    const state = this.requireState(key);
    state.failures += 1;
    state.consecutiveFailures += 1;
    if (options.cooldownMs !== undefined && options.cooldownMs > 0) {
      const until = this.now() + options.cooldownMs;
      if (state.cooldownUntil === undefined || state.cooldownUntil < until) {
        state.cooldownUntil = until;
      }
    }
  }

  /** New billing cycle: every key back to pristine, rotation restarts. */
  reset(): void {
    this.cursor = -1;
    for (const s of this.states) {
      s.uses = 0;
      s.successes = 0;
      s.failures = 0;
      s.consecutiveFailures = 0;
      s.exhaustedAt = undefined;
      s.exhaustReason = undefined;
      s.cooldownUntil = undefined;
    }
  }

  /** Redacted health view — safe for logs and metrics endpoints. */
  snapshot(): KeyHealth[] {
    return this.states.map((s, keyIndex) => {
      const health: KeyHealth = {
        keyIndex,
        maskedKey: maskKey(s.key),
        uses: s.uses,
        successes: s.successes,
        failures: s.failures,
        consecutiveFailures: s.consecutiveFailures,
        status: this.statusOf(s),
      };
      if (s.cooldownUntil !== undefined) health.cooldownUntil = s.cooldownUntil;
      if (s.exhaustedAt !== undefined) health.exhaustedAt = s.exhaustedAt;
      if (s.exhaustReason !== undefined) health.exhaustReason = s.exhaustReason;
      return health;
    });
  }

  private statusOf(state: KeyState): KeyStatus {
    if (state.exhaustedAt !== undefined) return "exhausted";
    if (state.cooldownUntil !== undefined && state.cooldownUntil > this.now()) return "cooldown";
    return "available";
  }

  private nextCooldownRetryMs(): number | undefined {
    const nowMs = this.now();
    let soonest: number | undefined;
    for (const s of this.states) {
      if (s.exhaustedAt === undefined && s.cooldownUntil !== undefined && s.cooldownUntil > nowMs) {
        soonest = soonest === undefined ? s.cooldownUntil : Math.min(soonest, s.cooldownUntil);
      }
    }
    return soonest === undefined ? undefined : soonest - nowMs;
  }

  private requireState(key: string): KeyState {
    const state = this.states.find((s) => s.key === key);
    if (!state) throw new UnknownKeyError(this.provider);
    return state;
  }
}
