/**
 * Phase A3 — Orchestrator shared type system: the canonical contract.
 *
 * Zero npm dependencies; internal imports only. Every phase from B onward
 * codes against these shapes. B2's Zod schema for the manager LLM is built
 * directly from the frozen const arrays exported here.
 *
 * Layer map:
 *   scene.ts      → ScenePlan + SceneComplexity (B3), aspect ratios, hints
 *   provider.ts   → ProviderId/Tier (C1), ProviderErrorKind taxonomy (D2)
 *   user.ts       → UserTier (F1) synced to A1 env tier names
 *   director.ts   → CharacterProfile + DirectorOutput (B2/B4)
 *   routing.ts    → RoutingDecision + reasons (C3/C4)
 *   generation.ts → GenerationResult (E2/E3) + statuses
 *   keys/errors   → A2 rotation error taxonomy, re-exported canonically
 */
export * from "./scene.js";
export * from "./provider.js";
export * from "./user.js";
export * from "./director.js";
export * from "./routing.js";
export * from "./generation.js";

export {
  AllKeysExhaustedError,
  ProviderNotConfiguredError,
  UnknownKeyError,
} from "../keys/errors.js";
