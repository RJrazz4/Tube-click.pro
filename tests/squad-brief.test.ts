/**
 * tests/squad-brief.test.ts — Ghost Intel Squad engine invariants.
 *
 * Exercises runSquadBrief (api/_agenticEngine.ts) with a mocked gateway
 * so tests are hermetic and don't burn AI credits. Covers:
 *   - rubric score ≥85 on a first-pass payload (critic passes).
 *   - self-heal loop: a low initial critic score triggers a remediation
 *     pass that raises the score.
 *   - paywall: handleSquadBrief returns 402 when consumeGhostAction
 *     reports PAYWALL, without invoking the agent chain.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoist mocks to top level (vitest hoists vi.mock regardless; declaring
// them here keeps execution order obvious). Use a mutable config object
// so each test can rewire responses without re-mocking between cases.
const gwState: {
  scout?: any;
  crawler?: any;
  analyst?: any;
  comparator?: any;
  criticScores: number[];
  calls: Record<string, number>;
} = { criticScores: [92], calls: {} };

vi.mock("../packages/orchestrator/ai-gateway.js", () => ({
  gatewayChatJson: vi.fn(async (opts: any) => {
    const sys: string = opts?.systemPrompt || "";
    if (sys.includes("SCOUT AGENT")) {
      gwState.calls.scout = (gwState.calls.scout || 0) + 1;
      return okJson(gwState.scout ?? { summary: "S", signals: ["s1"] });
    }
    if (sys.includes("CRAWLER AGENT")) {
      gwState.calls.crawler = (gwState.calls.crawler || 0) + 1;
      return okJson(gwState.crawler ?? { topSentiment: "positive", keyPhrases: ["a"] });
    }
    if (sys.includes("ANALYST AGENT")) {
      gwState.calls.analyst = (gwState.calls.analyst || 0) + 1;
      return okJson(gwState.analyst ?? {
        hookArchitecture: "h", retentionLoopMap: ["0-3s"], monetizationSignals: [],
        weaknessGaps: ["w"], ctaArchitecture: "end", pacingAssessment: "ok",
      });
    }
    if (sys.includes("COMPARATOR AGENT")) {
      gwState.calls.comparator = (gwState.calls.comparator || 0) + 1;
      return okJson(gwState.comparator ?? {
        strengths: [], weaknesses: [], opportunities: [], threats: [],
        attackVectors: [
          { title: "A", tactic: "t", expectedLift: "+5%" },
          { title: "B", tactic: "t", expectedLift: "+5%" },
          { title: "C", tactic: "t", expectedLift: "+5%" },
        ],
        differentiatorAngle: "d",
      });
    }
    if (sys.includes("CRITIC AGENT")) {
      gwState.calls.critic = (gwState.calls.critic || 0) + 1;
      const idx = (gwState.calls.critic || 1) - 1;
      const score = gwState.criticScores[Math.min(idx, gwState.criticScores.length - 1)] ?? 92;
      return okJson({ score, critique: score >= 85 ? "PASSED" : "Improve specificity." });
    }
    return okJson({});
  }),
  // Text variant is not used by squad but we stub it to keep imports safe.
  gatewayChatText: vi.fn(async () => okText("")),
}));

const mockConsume = vi.fn();
vi.mock("../api/_ghostLedger.js", () => ({
  consumeGhostAction: (...args: any[]) => mockConsume(...args),
}));

function okJson(obj: unknown) {
  return {
    text: JSON.stringify(obj),
    model: "google/gemini-2.5-flash",
    latencyMs: 10,
    modelsAttempted: ["google/gemini-2.5-flash"],
    failedOver: false,
    usage: { inputTokens: 100, outputTokens: 80, totalTokens: 180 },
  };
}
function okText(s: string) {
  return {
    text: s, model: "google/gemini-2.5-flash", latencyMs: 10,
    modelsAttempted: ["google/gemini-2.5-flash"], failedOver: false,
  };
}

describe("Ghost Intel Squad — runSquadBrief", () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    process.env.AI_GATEWAY_PRIMARY = "google/gemini-2.5-flash";
    gwState.scout = undefined;
    gwState.crawler = undefined;
    gwState.analyst = undefined;
    gwState.comparator = undefined;
    gwState.criticScores = [92];
    gwState.calls = {};
    mockConsume.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_PRIMARY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("produces a dossier with 3 attack vectors and passes the critic (≥85)", async () => {
    gwState.scout = { summary: "High velocity AI niche video.", signals: ["1.2M views", "niche overlap", "open-loop hook"] };
    gwState.crawler = { topSentiment: "positive", keyPhrases: ["authority", "open loop", "CTA", "proof"] };
    gwState.analyst = {
      hookArchitecture: "Contrarian shock claim with curiosity gap.",
      retentionLoopMap: ["0-3s hook", "0:15 tease", "0:45 proof"],
      monetizationSignals: ["ad break", "affiliate"],
      weaknessGaps: ["no concrete numbers", "unanswered comments"],
      ctaArchitecture: "end-card subscribe",
      pacingAssessment: "Mid-roll sag.",
    };
    gwState.comparator = {
      strengths: ["strong hook"], weaknesses: ["low proof"],
      opportunities: ["direct response"], threats: ["algorithm momentum"],
      attackVectors: [
        { title: "PROOF-STACK", tactic: "Open with data screenshot.", expectedLift: "+18% AVD" },
        { title: "GAP-FILL", tactic: "Answer comment questions.", expectedLift: "+12% CTR" },
        { title: "RETENTION-BOMB", tactic: "Three stacked open loops.", expectedLift: "+15% AVD" },
      ],
      differentiatorAngle: "Own the contrarian data angle.",
    };
    gwState.criticScores = [92];
    const { runSquadBrief } = await import("../api/_agenticEngine.js");
    const brief = await runSquadBrief({
      video: {
        videoId: "abc12345678", title: "The AI secret", url: "https://youtu.be/abc12345678",
        channelName: "Ghost Labs", views: "1.2M views", viewsCount: 1_200_000,
        viralVelocityScore: 85, estimatedRevenue: "$7,200", publishedAt: new Date().toISOString(),
      },
      transcript: { text: "A transcript. ".repeat(80), source: "piped", ghostReconstructed: false },
      comments: [{ author: "viewer", text: "nice", likeCount: 10 }],
      savedNiche: "Tech & Coding",
    });
    expect(brief.videoId).toBe("abc12345678");
    expect(brief.comparator.attackVectors).toHaveLength(3);
    expect(brief.criticAudit.score).toBeGreaterThanOrEqual(85);
    expect(brief.threatLevel).toBeGreaterThanOrEqual(0);
    expect(brief.threatLevel).toBeLessThanOrEqual(100);
  });

  it("self-heals when the first critic score is below threshold", async () => {
    gwState.criticScores = [62, 88];
    const { runSquadBrief } = await import("../api/_agenticEngine.js");
    const brief = await runSquadBrief({
      video: { videoId: "abc12345678", title: "T", url: "https://youtu.be/abc12345678", channelName: "C", views: "50k views", viewsCount: 50000, viralVelocityScore: 50 },
      transcript: { text: "words ".repeat(60), source: "x", ghostReconstructed: false },
      comments: [],
      savedNiche: "Niche",
    });
    // Critic must have been called at least twice (initial + post-remediation).
    expect(gwState.calls.critic).toBeGreaterThanOrEqual(2);
    // Analyst+Comparator re-run at least once during remediation.
    expect(gwState.calls.analyst).toBeGreaterThanOrEqual(2);
    expect(brief.criticAudit.selfHealed).toBe(true);
    expect(brief.criticAudit.iterations).toBeGreaterThanOrEqual(2);
    expect(brief.criticAudit.score).toBeGreaterThanOrEqual(85);
  });

  it("handleSquadBrief respects the paywall (no quota → 402) without running agents", async () => {
    mockConsume.mockResolvedValue({
      allowed: false, code: "PAYWALL", action: "squad",
      tier: "free", is_black_ops: false,
      used: 0, limit: 0, remaining: 0,
      reset_at: null, remaining_seconds: 0, total_runs: 0,
    });
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-svc-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (url.includes("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: "00000000-0000-0000-0000-000000000001" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });
    const { handleSquadBrief } = await import("../api/_squadBrief.js");
    const req = new Request("https://tubeclickpro.in/api/ghost/squad-brief", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({
        video: { videoId: "abc12345678", title: "T", url: "https://youtu.be/abc12345678", channelName: "C", views: "50k views", viewsCount: 50000 },
        savedNiche: "Niche",
      }),
    });
    const res = await handleSquadBrief(req);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("PAYWALL");
    // No agent should have been invoked (no critic calls).
    expect(gwState.calls.critic || 0).toBe(0);
    fetchSpy.mockRestore();
  });
});
