/**
 * Phase C3 — Routing Engine: ScenePlan → RoutingDecision.
 *
 * Policy (locked by tests):
 *   FREE tier users   → free providers only (premium is the upgrade wall,
 *                       and the token-saving mandate applied to monetization).
 *   COMPLEX scenes    → premium chain first (quality where it matters).
 *   SIMPLE scenes     → free chain only, ALWAYS (scenery never burns a
 *                       premium token — margin protection per the mandate).
 *   routingHint       → explicit prefer-* beats the complexity default
 *                       (when the tier allows it).
 *   pollinations      → ALWAYS tail of every chain, never excluded: the
 *                       keyless, unbannable, zero-server-cost sink.
 *   health "down"     → excluded; if it evicted the natural primary the
 *                       reason is provider-health (D4's breaker feeds this).
 *   "degraded"        → kept in place (pre-D4 semantics).
 *
 * Pure function: no state, no I/O — every decision is reproducible.
 */
import type {
  ProviderId,
  ProviderTier,
  RoutingDecision,
  RoutingReason,
  ScenePlan,
  UserTier,
} from "../types/index.js";

/** Minimal adapter surface the router needs (C2 adapters satisfy this). */
export interface RoutableProvider {
  id: ProviderId;
  tier: ProviderTier;
  keyless: boolean;
  isAvailable(): boolean;
}

/** Optional decision sink — C4's CostTracker plugs in here. */
export interface DecisionRecorder {
  record(decision: RoutingDecision): void;
}

export interface RouteContext {
  tier: UserTier;
  /** Adapters in play (typically every configured C2 provider). */
  providers: ReadonlyArray<RoutableProvider>;
  /** Health by provider; absent = "up". "down" excludes. */
  health?: Partial<Record<ProviderId, "up" | "degraded" | "down">>;
  /** C4 sink; receives every decision made. */
  tracker?: DecisionRecorder;
  now?: () => number;
}

/** No provider could be selected at all — a loud, never-silent failure. */
export class RoutingImpossibleError extends Error {
  readonly sceneIndex: number;
  readonly tier: UserTier;

  constructor(sceneIndex: number, tier: UserTier) {
    super(
      `No image provider available for scene ${sceneIndex} (tier "${tier}") — ` +
        "configure keys (IMAGE_API_KEYS) or enable POLLINATIONS_ENABLED",
    );
    this.name = "RoutingImpossibleError";
    this.sceneIndex = sceneIndex;
    this.tier = tier;
  }
}

/** Canonical precedence within each cost class; pollinations is NOT here — it is always tail. */
const PREMIUM_ORDER: ReadonlyArray<Exclude<ProviderId, "pollinations">> = ["agnes", "gemini"];
const FREE_KEYED_ORDER: ReadonlyArray<Exclude<ProviderId, "pollinations">> = ["hf"];
const ULTIMATE: ProviderId = "pollinations";

export function route(scene: ScenePlan, ctx: RouteContext): RoutingDecision {
  const now = ctx.now ?? Date.now;
  const allowPremium = ctx.tier !== "free";

  const isHealthy = (id: ProviderId): boolean => (ctx.health?.[id] ?? "up") !== "down";
  const configured = new Map<ProviderId, RoutableProvider>();
  for (const provider of ctx.providers) configured.set(provider.id, provider);

  const usable = (id: ProviderId): boolean => {
    const provider = configured.get(id);
    return provider !== undefined && provider.isAvailable() && isHealthy(id);
  };

  // Natural preference IGNORING availability — used to detect provider-health eviction.
  const hint = scene.routingHint;
  const wantsPremium =
    hint === "prefer-premium" ||
    (hint !== "prefer-free" && scene.complexity === "COMPLEX");

  // Margin lock: premium enters the candidate list ONLY when the tier allows
  // it AND the scene actually merits it (COMPLEX, or an explicit premium
  // hint). A prefer-free hint also strips premium for COMPLEX scenes.
  // Without this, premium would lurk in the FALLBACKS of cheap scenes.
  const premiumAllowedForScene =
    allowPremium &&
    hint !== "prefer-free" &&
    (scene.complexity === "COMPLEX" || hint === "prefer-premium");

  const premiumChain = premiumAllowedForScene ? PREMIUM_ORDER : [];
  const freeKeyedChain = FREE_KEYED_ORDER;

  // Candidate order: driven chain first, then the other chain,
  // pollinations tail (handled separately below).
  const keyedCandidates: ProviderId[] = wantsPremium
    ? [...premiumChain, ...freeKeyedChain]
    : [...freeKeyedChain, ...premiumChain];

  const naturalPrimary = keyedCandidates[0] ?? ULTIMATE;
  const selected = keyedCandidates.filter(usable);
  const pollinationsUsable = usable(ULTIMATE);

  let fallbacks: ProviderId[];
  let primary: ProviderId;
  if (selected.length > 0) {
    primary = selected[0];
    fallbacks = selected.slice(1);
    if (pollinationsUsable && !fallbacks.includes(ULTIMATE)) fallbacks.push(ULTIMATE);
  } else if (pollinationsUsable) {
    primary = ULTIMATE;
    fallbacks = [];
  } else {
    throw new RoutingImpossibleError(scene.index, ctx.tier);
  }

  const primaryTier: ProviderTier =
    primary === ULTIMATE ? "free" : (configured.get(primary)?.tier ?? "free");

  const reason = resolveReason({
    primary,
    naturalPrimary,
    wantsPremium,
    allowPremium,
    complexity: scene.complexity,
    hint,
  });

  const decision: RoutingDecision = {
    sceneIndex: scene.index,
    complexity: scene.complexity,
    providerId: primary,
    providerTier: primaryTier,
    reason,
    fallbacks,
    decidedAt: now(),
  };
  ctx.tracker?.record(decision);
  return decision;
}

function resolveReason(input: {
  primary: ProviderId;
  naturalPrimary: ProviderId;
  wantsPremium: boolean;
  allowPremium: boolean;
  complexity: ScenePlan["complexity"];
  hint: ScenePlan["routingHint"];
}): RoutingReason {
  // The ultimate sink had to serve as primary.
  if (input.primary === ULTIMATE) return "pollinations-ultimate";

  // The natural pick was evicted by availability/health.
  if (input.primary !== input.naturalPrimary) return "provider-health";

  // Free-tier user with a scene that naturally wants premium → walled off.
  if (!input.allowPremium && input.wantsPremium) return "user-tier";

  // An explicit hint (not "auto") drove the ordering.
  if (input.hint !== "auto") return "routing-hint";

  // Default: complexity did its job.
  return "complexity-match";
}
