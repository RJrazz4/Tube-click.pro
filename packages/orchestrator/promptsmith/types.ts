/**
 * Phase 1 — Promptsmith Types: OptimizedPromptSpec & request/result structures.
 */

export interface OptimizedPromptSpec {
  subject: string;
  style: string;
  camera: string;
  negativePrompts: string;
  rawPrompt: string;
}

export interface PromptsmithRequest {
  rawInput: string;
  context?: string;
  styleHint?: string;
}

export interface PromptsmithResult {
  spec: OptimizedPromptSpec;
  model: string;
  attempts: number;
  latencyMs: number;
}
