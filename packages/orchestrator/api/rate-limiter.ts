/**
 * Phase F4 — Per-tier rate limiting: token bucket per client identity.
 *
 * Every storyboard/thumbnail request costs real upstream tokens and
 * provider quota; F4 is the valve that keeps one client (or one abusive
 * free account) from starving 9,999 others — the 10k mandate applied to
 * the API edge.
 *
 * Algorithm: classic token bucket, lazily refilled on access (no timers,
 * no background churn):
 *   - tokens refill at the tier's sustained rate
 *   - a request consumes 1 token; none available → 429 verdict with
 *     retryAfterSeconds (the exact wait, never a guess)
 *   - buckets are keyed "tier:clientId" — an upgraded tier starts a
 *     fresh budget immediately (documented, intended)
 *
 * 10k memory contract: the bucket map is BOUNDED (default 10k entries);
 * overflow evicts the least-recently-touched bucket, so idle clients
 * pay for bursts of new churn, never active ones.
 *
 * The verdict shape and header serialization are F3's (types.ts) — this
 * class only decides; handlers only enforce.
 */
import type { UserTier } from "../types/index.js";

import type { RateLimitGate, RateLimitVerdict } from "./types.js";

export interface RateLimitRule {
  /** Burst capacity (requests), and the bucket ceiling. */
  capacity: number;
  /** Sustained refill rate (tokens per minute). */
  refillPerMinute: number;
}

export const DEFAULT_RATE_LIMIT_RULES: Record<UserTier, RateLimitRule> = {
  free: { capacity: 10, refillPerMinute: 10 }, // 1 req / 6s sustained
  pro: { capacity: 60, refillPerMinute: 60 }, // 1 req / s
  cinematic: { capacity: 300, refillPerMinute: 300 }, // 5 req / s
};

export const DEFAULT_MAX_BUCKETS = 10_000;

export interface TierRateLimiterOptions {
  /** Per-tier partial overrides merged over the defaults. */
  rules?: Partial<Record<UserTier, Partial<RateLimitRule>>>;
  now?: () => number;
  /** Bucket-map ceiling before oldest-touched eviction; default 10_000. */
  maxBuckets?: number;
}

interface Bucket {
  tokens: number;
  /** Last refill touch, ms — also the eviction key. */
  touchedAt: number;
}

export class TierRateLimiter implements RateLimitGate {
  private readonly rules: Record<UserTier, RateLimitRule>;
  private readonly now: () => number;
  private readonly maxBuckets: number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: TierRateLimiterOptions = {}) {
    this.rules = {
      free: { ...DEFAULT_RATE_LIMIT_RULES.free, ...options.rules?.free },
      pro: { ...DEFAULT_RATE_LIMIT_RULES.pro, ...options.rules?.pro },
      cinematic: { ...DEFAULT_RATE_LIMIT_RULES.cinematic, ...options.rules?.cinematic },
    };
    this.now = options.now ?? Date.now;
    this.maxBuckets = Math.max(1, Math.floor(options.maxBuckets ?? DEFAULT_MAX_BUCKETS));
  }

  /** Rule snapshot for H2's /metrics and diagnostics (fresh copies). */
  ruleFor(tier: UserTier): RateLimitRule {
    return { ...this.rules[tier] };
  }

  /** Tracked identities (bounded by maxBuckets) — H2 gauge feed. */
  get bucketCount(): number {
    return this.buckets.size;
  }

  check(tier: UserTier, clientId: string): RateLimitVerdict {
    const rule = this.rules[tier];
    const key = `${tier}:${clientId}`;
    const nowMs = this.now();
    const ratePerMs = rule.refillPerMinute / 60_000;

    let bucket = this.buckets.get(key);
    if (bucket === undefined) {
      bucket = { tokens: rule.capacity, touchedAt: nowMs };
      this.buckets.set(key, bucket);
      this.evictIfNeeded();
    } else {
      const elapsed = Math.max(0, nowMs - bucket.touchedAt);
      bucket.tokens = Math.min(rule.capacity, bucket.tokens + elapsed * ratePerMs);
      bucket.touchedAt = nowMs;
    }

    const msUntilFull = ((rule.capacity - bucket.tokens) / ratePerMs) || 0;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return {
        allowed: true,
        limit: rule.capacity,
        remaining: Math.floor(bucket.tokens),
        resetAtSeconds: Math.ceil((nowMs + Math.max(0, msUntilFull)) / 1000),
      };
    }

    const waitMs = (1 - bucket.tokens) / ratePerMs;
    return {
      allowed: false,
      limit: rule.capacity,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
      resetAtSeconds: Math.ceil((nowMs + Math.max(0, msUntilFull)) / 1000),
    };
  }

  /** Ops escape hatch: one identity (all tiers), or everything. */
  reset(clientId?: string): void {
    if (clientId === undefined) {
      this.buckets.clear();
      return;
    }
    for (const key of [...this.buckets.keys()]) {
      if (key.endsWith(`:${clientId}`)) this.buckets.delete(key);
    }
  }

  /** Insert-time guard: never exceed the map ceiling. */
  private evictIfNeeded(): void {
    if (this.buckets.size <= this.maxBuckets) return;
    let oldestKey: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of this.buckets) {
      if (bucket.touchedAt < oldestAt) {
        oldestAt = bucket.touchedAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) this.buckets.delete(oldestKey);
  }
}
