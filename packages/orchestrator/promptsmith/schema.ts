/**
 * Phase 1 — Promptsmith Schema: Zod validation for optimized prompt spec.
 */
import { z } from "zod";

export const optimizedPromptSpecSchema = z.object({
  subject: z.string().min(1),
  style: z.string().min(1),
  camera: z.string().min(1),
  negativePrompts: z.string().default(""),
  rawPrompt: z.string().min(1),
});

export type OptimizedPromptSpecParsed = z.infer<typeof optimizedPromptSpecSchema>;
