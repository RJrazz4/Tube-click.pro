/**
 * Phase 1 — PromptsmithService: raw input → OptimizedPromptSpec via LLM or fallback.
 */
import type { JsonCompletionClient, ChatMessage } from "../manager/openrouter-client.js";
import { extractJsonObject } from "../manager/json-extract.js";
import { optimizedPromptSpecSchema } from "./schema.js";
import { fallbackOptimizePrompt } from "./fallback.js";
import { buildPromptsmithSystemPrompt, buildPromptsmithUserPrompt } from "./system-prompt.js";
import type { PromptsmithRequest, PromptsmithResult } from "./types.js";

export class PromptsmithInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptsmithInputError";
  }
}

export interface PromptsmithServiceOptions {
  client?: JsonCompletionClient;
  maxAttempts?: number;
}

export class PromptsmithService {
  private readonly client?: JsonCompletionClient;
  private readonly maxAttempts: number;

  constructor(options: PromptsmithServiceOptions = {}) {
    this.client = options.client;
    this.maxAttempts = options.maxAttempts ?? 2;
  }

  async optimize(req: PromptsmithRequest): Promise<PromptsmithResult> {
    const raw = req.rawInput.trim();
    if (!raw) {
      throw new PromptsmithInputError("Promptsmith optimize: rawInput must not be empty");
    }

    if (!this.client) {
      const spec = fallbackOptimizePrompt(raw, req.styleHint);
      return { spec, model: "deterministic-fallback", attempts: 0, latencyMs: 0 };
    }

    const messages: ChatMessage[] = [
      { role: "system", content: buildPromptsmithSystemPrompt() },
      { role: "user", content: buildPromptsmithUserPrompt(raw, req.context, req.styleHint) },
    ];

    let model = "unknown";
    let totalLatency = 0;

    for (let attempts = 1; attempts <= this.maxAttempts; attempts++) {
      try {
        const res = await this.client.completeJson({
          messages,
          temperature: 0.3,
          maxTokens: 2048,
        });
        totalLatency += res.latencyMs;
        model = res.model;

        const candidate = extractJsonObject(res.content);
        if (candidate !== null) {
          const json = JSON.parse(candidate);
          const parsed = optimizedPromptSpecSchema.safeParse(json);
          if (parsed.success) {
            return {
              spec: parsed.data,
              model,
              attempts,
              latencyMs: totalLatency,
            };
          }
        }
    } catch (e) {
      // Stop the silent fail: surface the EXACT LLM error so the operator
      // can see WHY Promptsmith degraded to the rule-based fallback.
      console.error(
        "[promptsmith] optimize attempt failed:",
        e instanceof Error ? e.message : String(e),
      );
    }
    }

    const spec = fallbackOptimizePrompt(raw, req.styleHint);
    return {
      spec,
      model: `${model}-fallback`,
      attempts: this.maxAttempts,
      latencyMs: totalLatency,
    };
  }
}
