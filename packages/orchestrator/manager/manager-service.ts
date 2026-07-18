/**
 * Phase B4 — ManagerService: analyzeScript(script, tier?) → DirectorOutput.
 *
 * Pipeline (Master Plan B: Smart Manager Agent):
 *   1. build B2 system prompt (tier-informed scene cap guidance)
 *   2. B1 client → JSON-mode completion (OpenRouter, key-rotated)
 *   3. extract + JSON.parse + directorOutputSchema strict validation
 *   4. one corrective retry with the exact validation issues on failure
 *   5. normalize: sort by index, dedupe, re-index 0..n-1
 *   6. B3 heuristic complexity refinement (upgrade/downgrade tags)
 *
 * The service never talks to image providers — it emits the plan that
 * C3's routing engine and E's generator orchestrator execute.
 */
import { defaultTierLimits } from "../../shared/env/index.js";
import type { DirectorOutput, UserTier } from "../types/index.js";

import { refineScenes } from "./complexity.js";
import { directorOutputSchema } from "./director-schema.js";
import { extractJsonObject } from "./json-extract.js";
import type {
  ChatMessage,
  JsonCompletionClient,
} from "./openrouter-client.js";
import {
  buildDirectorSystemPrompt,
  buildDirectorUserPrompt,
} from "./system-prompt.js";

/** Script input was unusable before any LLM call. */
export class ManagerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagerInputError";
  }
}

/** LLM failed to produce a schema-valid DirectorOutput within the attempt budget. */
export class ManagerValidationError extends Error {
  readonly issues: readonly string[];
  /** First 200 chars of the last raw model reply (diagnostics, not key material). */
  readonly preview: string;
  readonly attemptsMade: number;

  constructor(issues: readonly string[], preview: string, attemptsMade: number) {
    super(
      `[manager] DirectorOutput validation failed after ${attemptsMade} attempt(s): ` +
        (issues[0] ?? "unknown issue"),
    );
    this.name = "ManagerValidationError";
    this.issues = issues;
    this.preview = preview;
    this.attemptsMade = attemptsMade;
  }
}

export interface ManagerServiceOptions {
  /** B1 client (or a mock implementing the same surface). */
  client: JsonCompletionClient;
  /** Total LLM attempts including the corrective retry; default 2. */
  maxAttempts?: number;
  /** Run B3 heuristic refinement; default true. */
  refineComplexity?: boolean;
}

export interface AnalyzeOptions {
  /** User tier — informs the scene-cap line in the system prompt. */
  tier?: UserTier;
}

export interface AnalyzeMeta {
  model: string;
  /** LLM calls consumed (1 = clean first pass). */
  attempts: number;
  /** B3 overrides applied to LLM complexity tags. */
  complexityOverrides: number;
  llmLatencyMs: number;
}

export interface AnalyzeResult {
  output: DirectorOutput;
  meta: AnalyzeMeta;
}

export class ManagerService {
  private readonly client: JsonCompletionClient;
  private readonly maxAttempts: number;
  private readonly refineComplexity: boolean;

  constructor(options: ManagerServiceOptions) {
    if ((options.maxAttempts ?? 2) < 1) {
      throw new ManagerInputError("ManagerService: maxAttempts must be >= 1");
    }
    this.client = options.client;
    this.maxAttempts = options.maxAttempts ?? 2;
    this.refineComplexity = options.refineComplexity ?? true;
  }

  async analyzeScript(script: string, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
    const trimmed = script.trim();
    if (!trimmed) throw new ManagerInputError("analyzeScript: script must not be empty");

    const tierCap = options.tier
      ? (defaultTierLimits()[options.tier].maxScenes ?? undefined)
      : undefined;

    const baseMessages: ChatMessage[] = [
      { role: "system", content: buildDirectorSystemPrompt({ maxScenes: tierCap }) },
      { role: "user", content: buildDirectorUserPrompt(trimmed) },
    ];

    let messages = baseMessages;
    let issues: string[] = [];
    let preview = "";
    let model = "unknown";
    let llmLatencyMs = 0;

    for (let attempts = 1; attempts <= this.maxAttempts; attempts += 1) {
      const result = await this.client.completeJson({
        messages,
        temperature: 0.3,
        maxTokens: 4096,
      });
      llmLatencyMs += result.latencyMs;
      model = result.model;
      preview = result.content.slice(0, 200);

      const candidate = extractJsonObject(result.content);
      if (candidate === null) {
        issues = ["no JSON object found in model output"];
      } else {
        let json: unknown;
        try {
          json = JSON.parse(candidate);
        } catch {
          json = undefined;
        }
        if (json === undefined) {
          issues = ["model output was not valid JSON"];
        } else {
          const parsed = directorOutputSchema.safeParse(json);
          if (parsed.success) {
            const normalized = normalizeDirectorOutput(parsed.data);
            const refined = this.refineComplexity
              ? refineScenes(normalized.scenes)
              : { scenes: normalized.scenes, overrides: 0 };
            return {
              output: { ...normalized, scenes: refined.scenes },
              meta: { model, attempts, complexityOverrides: refined.overrides, llmLatencyMs },
            };
          }
          issues = parsed.error.issues.map(
            (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
          );
        }
      }

      if (attempts < this.maxAttempts) {
        messages = [
          ...baseMessages,
          {
            role: "user",
            content:
              "Your previous reply failed validation:\n" +
              issues.map((i) => `- ${i}`).join("\n") +
              "\nReply with ONLY the corrected JSON object.",
          },
        ];
      }
    }

    throw new ManagerValidationError(issues, preview, this.maxAttempts);
  }
}

/** Sort, dedupe (first wins), and re-index scenes 0..n-1. */
function normalizeDirectorOutput(output: DirectorOutput): DirectorOutput {
  const seen = new Set<number>();
  const unique = [...output.scenes]
    .sort((a, b) => a.index - b.index)
    .filter((scene) => {
      if (seen.has(scene.index)) return false;
      seen.add(scene.index);
      return true;
    });
  return {
    ...output,
    scenes: unique.map((scene, index) => ({ ...scene, index })),
  };
}
