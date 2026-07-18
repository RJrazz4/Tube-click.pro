/**
 * Phase C4 — Cost Tracker: the analytics ledger for routing + generation.
 *
 * Two event streams feed it (both optional, both cheap):
 *   recordDecision  — C3 emits every RoutingDecision (why a provider was picked)
 *   recordOutcome   — E3 emits every GenerationResult (what actually happened)
 *
 * Storage is a bounded ring buffer (default 1000) — at 10k-scale this is
 * O(capacity) memory with zero reallocation cost, and summaries aggregate
 * over what remains. This module is the feedstock for H2's /metrics and
 * E4's cost_estimate — estimatedPremiumUnits is an honest unit proxy
 * (1 per premium generation, 0 for free), not a fabricated dollar figure.
 */
import type { GenerationResult, ProviderId, RoutingDecision, RoutingReason } from "../types/index.js";

export interface CostTrackerOptions {
  /** Ring capacity for decision entries; default 1000. */
  capacity?: number;
  /** Outcome log capacity; default = capacity. */
  outcomeCapacity?: number;
  now?: () => number;
}

export interface DecisionLogEntry extends RoutingDecision {
  /** Monotonic sequence number (survives ring wrap for ordering). */
  seq: number;
  loggedAt: number;
}

export interface OutcomeLogEntry {
  sceneIndex: number;
  provider?: ProviderId;
  costTier?: "free" | "premium";
  isFallback: boolean;
  status: "success" | "failed";
  attempts: number;
  keyRotations: number;
  latencyMs: number;
  loggedAt: number;
}

export interface CostSummary {
  decisions: {
    total: number;
    byReason: Partial<Record<RoutingReason, number>>;
    byProvider: Partial<Record<ProviderId, number>>;
    premiumRouted: number;
    freeRouted: number;
  };
  outcomes: {
    recorded: number;
    succeeded: number;
    failed: number;
    fallbacks: number;
    totalKeyRotations: number;
    avgLatencyMs: number;
    /** 1 per premium generation, 0 per free generation. */
    estimatedPremiumUnits: number;
  };
}

export class CostTracker {
  private readonly capacity: number;
  private readonly outcomeCapacity: number;
  private readonly now: () => number;

  private decisionsRing: DecisionLogEntry[] = [];
  private head = 0;
  private seq = 0;
  private outcomesLog: OutcomeLogEntry[] = [];

  constructor(options: CostTrackerOptions = {}) {
    this.capacity = Math.max(1, options.capacity ?? 1_000);
    this.outcomeCapacity = Math.max(1, options.outcomeCapacity ?? this.capacity);
    this.now = options.now ?? Date.now;
  }

  /** C3 hook — records one routing decision. */
  record(decision: RoutingDecision): void {
    const entry: DecisionLogEntry = { ...decision, seq: this.seq, loggedAt: this.now() };
    this.seq += 1;
    if (this.decisionsRing.length < this.capacity) {
      this.decisionsRing.push(entry);
    } else {
      this.decisionsRing[this.head] = entry;
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /** E3 hook — records one generation outcome. */
  recordOutcome(result: GenerationResult): void {
    const entry: OutcomeLogEntry = {
      sceneIndex: result.sceneIndex,
      status: result.status,
      isFallback: result.isFallback,
      attempts: result.attempts,
      keyRotations: result.keyRotations,
      latencyMs: result.latencyMs,
      loggedAt: this.now(),
    };
    if (result.provider !== undefined) entry.provider = result.provider;
    if (result.costTier !== undefined) entry.costTier = result.costTier;
    this.outcomesLog.push(entry);
    if (this.outcomesLog.length > this.outcomeCapacity) {
      this.outcomesLog.splice(0, this.outcomesLog.length - this.outcomeCapacity);
    }
  }

  /** Decisions in chronological order (oldest first). */
  decisions(): readonly DecisionLogEntry[] {
    if (this.decisionsRing.length <= this.head || this.head === 0) {
      return [...this.decisionsRing];
    }
    return [...this.decisionsRing.slice(this.head), ...this.decisionsRing.slice(0, this.head)];
  }

  outcomes(): readonly OutcomeLogEntry[] {
    return [...this.outcomesLog];
  }

  summary(): CostSummary {
    const byReason: Partial<Record<RoutingReason, number>> = {};
    const byProvider: Partial<Record<ProviderId, number>> = {};
    let premiumRouted = 0;
    let freeRouted = 0;
    for (const entry of this.decisions()) {
      byReason[entry.reason] = (byReason[entry.reason] ?? 0) + 1;
      byProvider[entry.providerId] = (byProvider[entry.providerId] ?? 0) + 1;
      if (entry.providerTier === "premium") premiumRouted += 1;
      else freeRouted += 1;
    }

    let succeeded = 0;
    let failed = 0;
    let fallbacks = 0;
    let totalKeyRotations = 0;
    let totalLatency = 0;
    let estimatedPremiumUnits = 0;
    for (const outcome of this.outcomesLog) {
      if (outcome.status === "success") succeeded += 1;
      else failed += 1;
      if (outcome.isFallback) fallbacks += 1;
      totalKeyRotations += outcome.keyRotations;
      totalLatency += outcome.latencyMs;
      if (outcome.costTier === "premium") estimatedPremiumUnits += 1;
    }
    const recorded = this.outcomesLog.length;

    return {
      decisions: {
        total: this.seq,
        byReason,
        byProvider,
        premiumRouted,
        freeRouted,
      },
      outcomes: {
        recorded,
        succeeded,
        failed,
        fallbacks,
        totalKeyRotations,
        avgLatencyMs: recorded === 0 ? 0 : Math.round(totalLatency / recorded),
        estimatedPremiumUnits,
      },
    };
  }
}
