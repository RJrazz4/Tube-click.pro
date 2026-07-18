/**
 * Phase 1 — Promptsmith Rule-Based Deterministic Fallback.
 */
import type { OptimizedPromptSpec } from "./types.js";

export function fallbackOptimizePrompt(rawInput: string, styleHint?: string): OptimizedPromptSpec {
  const cleaned = rawInput.replace(/([Hh]inglish|[Hh]ello|[Bb]hai|[Yy]aar)/g, "").trim();
  const subject = cleaned || "Cinematic scene composition";
  const style = styleHint || "photorealistic, cinematic lighting, 8k resolution, highly detailed";
  const camera = "wide shot, professional composition, sharp focus";
  const negativePrompts = "blurry, low quality, distorted, deformed, ugly, watermark";
  const rawPrompt = `${subject}, ${style}, ${camera}`;

  return {
    subject,
    style,
    camera,
    negativePrompts,
    rawPrompt,
  };
}
