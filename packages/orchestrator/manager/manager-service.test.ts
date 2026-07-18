import { describe, expect, it } from "vitest";

import {
  ManagerInputError,
  ManagerService,
  ManagerValidationError,
} from "./manager-service.js";
import type {
  JsonCompletionClient,
  JsonCompletionRequest,
} from "./openrouter-client.js";

function fakeClient(contents: string[]) {
  const calls: JsonCompletionRequest[] = [];
  let i = 0;
  const client: JsonCompletionClient = {
    completeJson: async (req) => {
      calls.push(req);
      const content = contents[Math.min(i, contents.length - 1)];
      i += 1;
      return { content, model: "test-model", keyIndex: 0, attempts: 1, latencyMs: 5 };
    },
  };
  return { client, calls };
}

const sceneOk = (over: Record<string, unknown> = {}) => ({
  index: 0,
  title: "Opening sky",
  prompt: "wide dawn sky over valley",
  negativePrompt: "",
  complexity: "SIMPLE",
  aspectRatio: "16:9",
  routingHint: "auto",
  ...over,
});

const outputJson = (scenes: unknown[], profile: unknown = null) =>
  JSON.stringify({ characterProfile: profile, scenes });

describe("ManagerService.analyzeScript", () => {
  it("returns a validated DirectorOutput on a clean first pass", async () => {
    const { client } = fakeClient([outputJson([sceneOk()])]);
    const service = new ManagerService({ client });
    const result = await service.analyzeScript("A calm intro over nature.");
    expect(result.output.scenes).toHaveLength(1);
    expect(result.output.characterProfile).toBeNull();
    expect(result.meta).toMatchObject({ model: "test-model", attempts: 1, complexityOverrides: 0 });
  });

  it("sorts by index and re-indexes scenes 0..n-1 (LLM numbering tolerated)", async () => {
    const { client } = fakeClient([
      outputJson([sceneOk({ index: 5, title: "Later" }), sceneOk({ index: 2, title: "Earlier" })]),
    ]);
    const service = new ManagerService({ client });
    const result = await service.analyzeScript("Two beats.");
    expect(result.output.scenes.map((s) => s.title)).toEqual(["Earlier", "Later"]);
    expect(result.output.scenes.map((s) => s.index)).toEqual([0, 1]);
  });

  it("dedupes repeated indices, first occurrence wins", async () => {
    const { client } = fakeClient([
      outputJson([sceneOk({ index: 0, title: "First" }), sceneOk({ index: 0, title: "Dupe" })]),
    ]);
    const service = new ManagerService({ client });
    const result = await service.analyzeScript("Duplicated beat.");
    expect(result.output.scenes).toHaveLength(1);
    expect(result.output.scenes[0].title).toBe("First");
  });

  it("parses fenced JSON output", async () => {
    const { client } = fakeClient(["```json\n" + outputJson([sceneOk()]) + "\n```"]);
    const service = new ManagerService({ client });
    const result = await service.analyzeScript("Fenced output.");
    expect(result.output.scenes).toHaveLength(1);
  });

  it("retries once with the exact validation issues, then succeeds", async () => {
    const { client, calls } = fakeClient(["definitely not json", outputJson([sceneOk()])]);
    const service = new ManagerService({ client });
    const result = await service.analyzeScript("Needs a retry.");
    expect(result.meta.attempts).toBe(2);
    expect(calls).toHaveLength(2);
    const feedback = calls[1].messages[calls[1].messages.length - 1];
    expect(feedback.role).toBe("user");
    expect(feedback.content).toContain("failed validation");
  });

  it("throws ManagerValidationError when the model never converges", async () => {
    const { client } = fakeClient(['{"scenes": "nope"}']);
    const service = new ManagerService({ client });
    try {
      await service.analyzeScript("Never valid.");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ManagerValidationError);
      const e = err as ManagerValidationError;
      expect(e.attemptsMade).toBe(2);
      expect(e.issues.length).toBeGreaterThan(0);
      expect(e.preview).toContain("nope");
    }
  });

  it("honours maxAttempts=1 (single shot)", async () => {
    const { client, calls } = fakeClient(["junk"]);
    const service = new ManagerService({ client, maxAttempts: 1 });
    await expect(service.analyzeScript("One shot.")).rejects.toBeInstanceOf(ManagerValidationError);
    expect(calls).toHaveLength(1);
  });

  it("applies B3 complexity refinement end-to-end (LLM SIMPLE → COMPLEX upgrade)", async () => {
    const { client } = fakeClient([
      outputJson([sceneOk({ complexity: "SIMPLE", routingHint: "prefer-free", prompt: "a woman smiling at the camera, eyes bright" })]),
    ]);
    const service = new ManagerService({ client });
    const result = await service.analyzeScript("Host intro.");
    expect(result.output.scenes[0].complexity).toBe("COMPLEX");
    expect(result.output.scenes[0].routingHint).toBe("prefer-premium");
    expect(result.meta.complexityOverrides).toBe(1);
  });

  it("skips refinement when disabled", async () => {
    const { client } = fakeClient([
      outputJson([sceneOk({ complexity: "SIMPLE", prompt: "a woman smiling at the camera" })]),
    ]);
    const service = new ManagerService({ client, refineComplexity: false });
    const result = await service.analyzeScript("Host intro.");
    expect(result.output.scenes[0].complexity).toBe("SIMPLE");
    expect(result.meta.complexityOverrides).toBe(0);
  });

  it("informs the system prompt with the free tier scene cap (F1 observes here)", async () => {
    const { client, calls } = fakeClient([outputJson([sceneOk()])]);
    const service = new ManagerService({ client });
    await service.analyzeScript("Tier-informed.", { tier: "free" });
    expect(calls[0].messages[0].role).toBe("system");
    expect(calls[0].messages[0].content).toContain("AT MOST 4 scenes");
  });

  it("accepts a full character profile through the pipeline", async () => {
    const { client } = fakeClient([
      outputJson([sceneOk()], {
        name: "Ava",
        description: "silver braid, green cloak",
        styleGuide: "cinematic, 35mm",
        negativePrompt: "blurry",
      }),
    ]);
    const service = new ManagerService({ client });
    const result = await service.analyzeScript("Ava's journey.");
    expect(result.output.characterProfile?.name).toBe("Ava");
  });

  it("rejects empty scripts before any LLM call", async () => {
    const { client, calls } = fakeClient(["unreachable"]);
    const service = new ManagerService({ client });
    await expect(service.analyzeScript("   ")).rejects.toBeInstanceOf(ManagerInputError);
    expect(calls).toHaveLength(0);
  });
});
