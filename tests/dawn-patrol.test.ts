/**
 * tests/dawn-patrol.test.ts — Dawn Patrol (MP6) invariants.
 *
 * Exercises the MP6 engine (api/_dawnPatrol.ts) with hermetic mocks.
 * Covers:
 *   - paywall 402 when consumeGhostAction reports PAYWALL.
 *   - brief shape: headline string, exactly 3 bullets, opportunities/threats arrays.
 *   - latest returns the stored briefs list.
 *   - config round-trip.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const gwCalls = { json: 0 };

vi.mock("../packages/orchestrator/ai-gateway.js", () => ({
  gatewayChatJson: vi.fn(async () => {
    gwCalls.json += 1;
    return {
      text: JSON.stringify({
        headline: "Niche heating up — 3 new videos posted overnight",
        bullets: [
          "Top competitor posted a shock-claim hook; views climbing 12% hour-over-hour.",
          "Two channels are copying your open-loop structure; differentiate with proof stack.",
          "Publish before 10am local with a contrarian data screenshot to win the slot.",
        ],
        opportunities: ["proof-stack", "pre-10am-post"],
        threats: ["copycat-open-loops"],
      }),
      model: "google/gemini-2.5-flash",
      latencyMs: 20,
      modelsAttempted: ["google/gemini-2.5-flash"],
      failedOver: false,
      usage: { inputTokens: 200, outputTokens: 150, totalTokens: 350 },
    };
  }),
  gatewayChatText: vi.fn(async () => ({
    text: "", model: "google/gemini-2.5-flash", latencyMs: 5,
    modelsAttempted: ["google/gemini-2.5-flash"], failedOver: false,
  })),
}));

const mockConsume = vi.fn();
vi.mock("../api/_ghostLedger.js", () => ({
  consumeGhostAction: (...args: any[]) => mockConsume(...args),
}));

function authOk() {
  return { id: "00000000-0000-0000-0000-000000000001" };
}

describe("Ghost Dawn Patrol", () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
    process.env.AI_GATEWAY_PRIMARY = "google/gemini-2.5-flash";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-svc-key";
    gwCalls.json = 0;
    mockConsume.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_PRIMARY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.DAWN_PATROL_CRON_SECRET;
    delete process.env.CRON_SECRET;
  });

  it("returns 402 on paywall without invoking brief generation", async () => {
    mockConsume.mockResolvedValue({
      allowed: false, code: "PAYWALL", action: "dawn_patrol",
      tier: "free", is_black_ops: false,
      used: 0, limit: 0, remaining: 0,
      reset_at: null, remaining_seconds: 0, total_runs: 0,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (url.includes("/auth/v1/user")) {
        return new Response(JSON.stringify(authOk()), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    const { handleDawnPatrolGenerate } = await import("../api/_dawnPatrol.js");
    const req = new Request("https://tubeclickpro.in/api/ghost/dawn-patrol-generate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({ niche: "Tech", competitors: [] }),
    });
    const res = await handleDawnPatrolGenerate(req);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.code).toBe("PAYWALL");
    expect(gwCalls.json).toBe(0);
    fetchSpy.mockRestore();
  });

  it("produces a brief with headline + 3 bullets on valid call", async () => {
    mockConsume.mockResolvedValue({
      allowed: true, code: "OK", action: "dawn_patrol",
      tier: "pro", is_black_ops: false,
      used: 0, limit: 1, remaining: 1,
      reset_at: null, remaining_seconds: 0, total_runs: 0,
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (url.includes("/auth/v1/user")) {
        return new Response(JSON.stringify(authOk()), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/rpc/ghost_dawn_patrol_upsert")) {
        return new Response(JSON.stringify({ ok: true, id: "brief-1" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    const { handleDawnPatrolGenerate } = await import("../api/_dawnPatrol.js");
    const req = new Request("https://tubeclickpro.in/api/ghost/dawn-patrol-generate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({
        niche: "Tech",
        competitors: [{ videoId: "abc12345678", title: "T", channelName: "C", viewsCount: 10000, viralVelocityScore: 60 }],
      }),
    });
    const res = await handleDawnPatrolGenerate(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.headline).toBe("string");
    expect(body.headline.length).toBeGreaterThan(3);
    expect(Array.isArray(body.bullets)).toBe(true);
    expect(body.bullets).toHaveLength(3);
    expect(Array.isArray(body.opportunities)).toBe(true);
    expect(Array.isArray(body.threats)).toBe(true);
    expect(gwCalls.json).toBe(1);
    fetchSpy.mockRestore();
  });

  it("latest route returns briefs list from RPC", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (url.includes("/auth/v1/user")) {
        return new Response(JSON.stringify(authOk()), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/rpc/ghost_dawn_patrol_latest")) {
        return new Response(JSON.stringify([{ id: "b1", headline: "H", bullets: ["a", "b", "c"], brief_date: "2026-08-14" }]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    const { handleDawnPatrolLatest } = await import("../api/_dawnPatrol.js");
    const req = new Request("https://tubeclickpro.in/api/ghost/dawn-patrol-latest", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({ n: 5 }),
    });
    const res = await handleDawnPatrolLatest(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.briefs)).toBe(true);
    expect(body.briefs).toHaveLength(1);
    fetchSpy.mockRestore();
  });

  it("config POST round-trips enabled + send_hour", async () => {
    const lastBody: any = {};
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : (input?.url ?? "");
      if (url.includes("/auth/v1/user")) {
        return new Response(JSON.stringify(authOk()), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/rpc/ghost_dawn_patrol_config_set")) {
        const init = (input as any)?.init;
        try { lastBody.body = init?.body ? JSON.parse(init.body as string) : {}; } catch { /* ignore */ }
        return new Response(JSON.stringify({ ok: true, enabled: true, send_hour: 6 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
    });

    const { handleDawnPatrolConfig } = await import("../api/_dawnPatrol.js");
    const req = new Request("https://tubeclickpro.in/api/ghost/dawn-patrol-config", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({ enabled: true, sendHour: 6 }),
    });
    const res = await handleDawnPatrolConfig(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.config.send_hour).toBe(6);
    fetchSpy.mockRestore();
  });
});
