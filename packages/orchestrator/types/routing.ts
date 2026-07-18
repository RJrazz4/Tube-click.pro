/**
 * Phase A3 — RoutingDecision: C3's output, C4's analytics record.
 *
 * The routing engine maps one ScenePlan → one primary provider plus an
 * ordered fallback candidate list (D3 cascade terminates at pollinations).
 * Every decision is logged with its reason for the cost tracker.
 */
import type { ProviderId, ProviderTier } from "./provider.js";
import type { SceneComplexity } from "./scene.js";

/** Why the engine picked this provider — drives C4 analytics. */
export const ROUTING_REASONS = [
  /** Scene complexity matched the provider's natural tier (B3 → C3). */
  "complexity-match",
  /** User tier's provider allowance forced the choice (F1). */
  "user-tier",
  /** Manager routingHint steered the choice. */
  "routing-hint",
  /** Preferred provider was unhealthy / circuit-broken (D4). */
  "provider-health",
  /** Deeper chain position after earlier candidates failed (D3). */
  "fallback",
  /** Pollinations as last resort — always available, no key. */
  "pollinations-ultimate",
] as const;
export type RoutingReason = (typeof ROUTING_REASONS)[number];

export interface RoutingDecision {
  sceneIndex: number;
  /** Echo of the scene's classification for analytics joins. */
  complexity: SceneComplexity;
  /** Primary provider to attempt. */
  providerId: ProviderId;
  /** Cost class of the primary (E3 stamps this onto results as costTier). */
  providerTier: ProviderTier;
  reason: RoutingReason;
  /** Ordered fallbacks if the primary fails; ends in "pollinations" when enabled. */
  fallbacks: ProviderId[];
  /** Epoch ms when the decision was made. */
  decidedAt: number;
}
