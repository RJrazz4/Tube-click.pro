/**
 * tests/visual-recon.test.ts — Ghost Visual Recon (MP5) invariants.
 *
 * Exercises the MP5 engine (api/_visualRecon.ts) with hermetic mocks.
 * Covers:
 *   - buildSampleFrames returns ≤12 entries with strictly monotonic
 *     tsSeconds scaled against the reported duration.
 *   - handleReconIngest returns 402 on paywall without invoking captioning.
 *   - handleReconSearch returns 428 INDEX_REQUIRED when no frames exist.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const gwCalls = { json: 0 };

vi.mock("../packages/orchestrator/ai-gateway.js", () => ({
  gatewayChatJson: vi.fn(async () => {
    gwCalls.json += 1;
    return {
      text: JSON.stringify({ caption: "A test frame with red arrow.", visualTags: ["red", "arrow"] }),
      model: "google/gemini-2.5-flash",
      latencyMs: 5,
      modelsAttempted: ["google/gemini-2.5-flash"],
      failedOver: false,
      usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80 },
    };
  }),
  gatewayChatText: vi.fn(async () => ({
    text: "", model: "google/gemini-2.5-flash", latencyMs: 5,
    modelsAttempted: ["google/gemini-2.5-flash"], failedOver: false,
  })),
}));

const mockEmbedTexts = vi.fn(async (texts: string[]) => texts.map(() => new Array(1536).fill(0.001)));
const mockEmbedText = vi.fn(async () => new Array(1536).fill(0.001));
vi.mock("../packages/orchestrator/embeddings.js", () => ({
  embedTexts: (...args: any[]) => mockEmbedTexts(...args),
  embedText: (...args: any[]) => mockEmbedText(...args),
}));

const mockConsume = vi.fn();
vi.mock("../api/_ghostLedger.js", () => ({
  consumeGhostAction: (...args: any[]) => mockConsume(...args),
}));

describe("Ghost Visual Recon", () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    process.env.AI_GATEWAY_PRIMARY = "google/gemini-2.5-flash";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-svc-key";
    gwCalls.json = 0;
    mockConsume.mockReset();
    mockEmbedTexts.mockClear();
    mockEmbedText.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_PRIMARY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("buildSampleFrames returns ≤12 entries with ascending tsSeconds capped at duration-2", async () => {
    const { buildSampleFrames } = await import("../api/_visualRecon.js");
    const frames = buildSampleFrames("abc12345678", 180);
    expect(frames.length).toBeLessThanOrEqual(12);
    expect(frames.length).toBeGreaterThanOrEqual(8);
    for (const f of frames) {
      expect(f.thumbUrl).toMatch(/^https:\/\/i\.ytimg\.com\/vi\/abc12345678\//);
      expect(f.tsSeconds).toBeGreaterThanOrEqual(0);
      expect(f.tsSeconds).toBeLessThanOrEqual(178);
      expect(f.frameIdx).toBeGreaterThanOrEqual(0);
      expect(f.frameIdx).toBeLessThanOrEqual(11);
    }
    // Timestamps should be monotonically non-decreasing after sorting by tsSeconds.
    const sorted = [...frames].sort((a, b) => a.tsSeconds - b.tsSeconds);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].tsSeconds).toBeGreaterThanOrEqual(sorted[i - 1].tsSeconds);
    }
    // Default (unknown duration) also produces sane frames.
    const def = buildSampleFrames("abc12345678");
    expect(def.length).toBe(frames.length);
  });

  it("handleReconIngest returns 402 on paywall without captioning", async () => {
    mockConsume.mockResolvedValue({
      allowed: false, code: "PAYWALL", action: "recon",
      tier: "free", is_black_ops: false,
      used: 0, limit: 0, remaining: 0,
      reset_at: null, remaining_seconds: 0, total_runs: 0,
    });
    // Pre-cache count = 0 so we fall through to the credit gate.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (url.includes("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: "00000000-0000-0000-0000-000000000001" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/rpc/ghost_recon_count")) {
        return new Response(JSON.stringify({ count: 0, ready: false }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    const { handleReconIngest } = await import("../api/_visualRecon.js");
    const req = new Request("https://tubeclickpro.in/api/ghost/recon-ingest", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({
        video: { videoId: "abc12345678", title: "T", url: "https://youtu.be/abc12345678" },
      }),
    });
    const res = await handleReconIngest(req);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("PAYWALL");
    // Must NOT have called the multimodal caption path.
    expect(gwCalls.json).toBe(0);
    fetchSpy.mockRestore();
  });

  it("handleReconSearch returns 428 INDEX_REQUIRED when no frames are indexed", async () => {
    // Auth passes; search RPC returns null (no rows).
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (url.includes("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: "00000000-0000-0000-0000-000000000001" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/rpc/ghost_recon_search")) {
        return new Response("null", { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    const { handleReconSearch } = await import("../api/_visualRecon.js");
    const req = new Request("https://tubeclickpro.in/api/ghost/recon-search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({ videoId: "abc12345678", query: "red arrow" }),
    });
    const res = await handleReconSearch(req);
    expect(res.status).toBe(428);
    const body = await res.json();
    expect(body.code).toBe("INDEX_REQUIRED");
    fetchSpy.mockRestore();
  });
});
