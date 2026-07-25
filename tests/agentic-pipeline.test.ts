import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { runAgenticPipeline } from "../api/_agenticEngine.js";

describe("runAgenticPipeline — Multi-Agent Adversarial Engine", () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    process.env.AI_GATEWAY_PRIMARY = "google/gemini-2.5-flash";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_PRIMARY;
  });

  it("executes writer and critic agent passes successfully", async () => {
    // Mock gatewayChatJson responses for Writer and Critic
    const { gatewayChatJson } = await import("../packages/orchestrator/ai-gateway.js");
    vi.mock("../packages/orchestrator/ai-gateway.js", async (importOriginal) => {
      const orig = await importOriginal<typeof import("../packages/orchestrator/ai-gateway.js")>();
      return {
        ...orig,
        gatewayChatJson: vi.fn().mockImplementation(async (opts) => {
          if (opts.systemPrompt?.includes("Retention Critic")) {
            return {
              text: JSON.stringify({ score: 95, critique: "PASSED" }),
              model: "google/gemini-2.5-flash",
              latencyMs: 120,
              modelsAttempted: ["google/gemini-2.5-flash"],
              failedOver: false,
            };
          }
          return {
            text: JSON.stringify({
              titles: ["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"],
              hooks: ["Hook 1", "Hook 2"],
              script: "Test voiceover script ready for production.",
              hashtags: ["#viral", "#creator"],
              description: "Test description",
              strategyBrief: "Test brief",
              experimentPlan: ["Test 1", "Test 2", "Test 3"],
            }),
            model: "google/gemini-2.5-flash",
            latencyMs: 250,
            modelsAttempted: ["google/gemini-2.5-flash"],
            failedOver: false,
          };
        }),
      };
    });

    const result = await runAgenticPipeline({
      topic: "Deep AI Architectures",
      platform: "YouTube",
      style: "Dramatic",
      language: "english",
      channelMemory: {
        niche: "AI & Tech",
        targetAudience: "Developers",
      },
    });

    expect(result.titles.length).toBe(5);
    expect(result.script).toBe("Test voiceover script ready for production.");
    expect(result.agentAudit.score).toBe(92);
  });
});
