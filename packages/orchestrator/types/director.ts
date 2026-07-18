/**
 * Phase A3 — DirectorOutput: the Manager Agent's strict output contract
 * (Master Plan B2/B4).
 *
 * B2 engineers a system prompt forcing the manager LLM
 * (xiaomi/mimo-v2.5-free via OpenRouter, JSON mode) to emit exactly:
 *
 *   { characterProfile, scenes: [{ complexity, prompt, negativePrompt,
 *                                  aspectRatio, routingHint }] }
 *
 * B4 validates the raw JSON against this shape before any routing happens.
 */
import type { ScenePlan } from "./scene.js";

/**
 * Canonical character sheet, folded into every scene prompt so a recurring
 * protagonist looks identical across providers (premium or fallback).
 */
export interface CharacterProfile {
  name: string;
  /** Canonical visual description ("pale elf archer, silver braid, green cloak"). */
  description: string;
  /** Art-direction anchors applied to every scene ("cinematic, 35mm, muted teal"). */
  styleGuide: string;
  /** Global negatives ("blurry, extra fingers, watermark") merged per scene. */
  negativePrompt: string;
}

/** Validated manager output — the single input to routing + generation. */
export interface DirectorOutput {
  /**
   * Null for characterless scripts (pure scenery/montage) — the Manager
   * must not invent a protagonist that isn't in the script.
   */
  characterProfile: CharacterProfile | null;
  scenes: ScenePlan[];
}
