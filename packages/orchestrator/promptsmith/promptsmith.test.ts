/**
 * Phase 1 — Promptsmith Unit Tests.
 */
import { describe, expect, it } from "vitest";
import { PromptsmithService, PromptsmithInputError } from "./promptsmith-service.js";
import { fallbackOptimizePrompt } from "./fallback.js";
import type { JsonCompletionClient, JsonCompletionResult } from "../manager/openrouter-client.js";

class MockJsonClient implements JsonCompletionClient {
  private readonly reply: string;
  constructor(reply: string) {
    this.reply = reply;
  }
  async completeJson(): Promise<JsonCompletionResult> {
    return {
      content: this.reply,
      model: "test-model-free",
      keyIndex: 0,
      attempts: 1,
      latencyMs: 10,
    };
  }
}

describe("PromptsmithService", () => {
  it("rejects empty raw input", async () => {
    const service = new PromptsmithService();
    await expect(service.optimize({ rawInput: "   " })).rejects.toThrow(PromptsmithInputError);
  });

  it("falls back gracefully when no client is provided", async () => {
    const service = new PromptsmithService();
    const res = await service.optimize({ rawInput: "ek sundar sunset bhai" });
    expect(res.spec).toBeDefined();
    expect(res.spec.subject).toContain("sunset");
    expect(res.model).toBe("deterministic-fallback");
  });

  it("successfully parses valid LLM JSON output into OptimizedPromptSpec", async () => {
    const validJson = JSON.stringify({
      subject: "A majestic golden sunset over ocean waves",
      style: "Cinematic photorealistic 8k render",
      camera: "Wide angle epic establishing shot",
      negativePrompts: "blurry, low quality",
      rawPrompt: "A majestic golden sunset over ocean waves, Cinematic photorealistic 8k render, Wide angle epic establishing shot"
    });

    const client = new MockJsonClient(validJson);
    const service = new PromptsmithService({ client });
    const res = await service.optimize({ rawInput: "samandar par sundar sunset" });

    expect(res.model).toBe("test-model-free");
    expect(res.attempts).toBe(1);
    expect(res.spec.subject).toBe("A majestic golden sunset over ocean waves");
    expect(res.spec.rawPrompt).toContain("golden sunset");
  });

  it("falls back to rule-based fallback if LLM returns invalid JSON or schema fails", async () => {
    const invalidJson = "Not valid JSON at all";
    const client = new MockJsonClient(invalidJson);
    const service = new PromptsmithService({ client, maxAttempts: 1 });
    const res = await service.optimize({ rawInput: "cyberpunk city neon rain" });

    expect(res.spec).toBeDefined();
    expect(res.spec.subject).toContain("cyberpunk city neon rain");
    expect(res.model).toContain("fallback");
  });
});
