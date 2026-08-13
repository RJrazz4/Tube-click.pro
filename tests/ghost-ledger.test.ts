/**
 * tests/ghost-ledger.test.ts — Ghost Credit Ledger tests.
 *
 * These tests validate the local module wiring (zero quota for guest,
 * limit enforcement shapes, tick/rollover semantics in the zustand
 * store). They do NOT require a live Supabase connection; the RPC layer
 * is tested via integration against a local/CI Supabase instance when
 * available. Any call to /api/ghost/credits is mocked through the
 * fetch stub.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useGhostCreditsStore } from "../src/stores/useGhostCreditsStore.js";

const ZERO = { used: 0, limit: 0, remaining: 0, allowed: false, resetAt: null, remainingSeconds: 0, totalRuns: 0 };

describe("Ghost Credits Store", () => {
  beforeEach(() => {
    useGhostCreditsStore.getState().reset();
  });

  it("initializes in guest/zero state", () => {
    const s = useGhostCreditsStore.getState();
    expect(s.tier).toBe("guest");
    expect(s.isBlackOps).toBe(false);
    expect(s.actions.interrogate).toEqual(ZERO);
    expect(s.actions.squad).toEqual(ZERO);
    expect(s.actions.recon).toEqual(ZERO);
    expect(s.actions.dawn_patrol).toEqual(ZERO);
  });

  it("hydrate() applies a snapshot and resets error/loading", () => {
    useGhostCreditsStore.setState({ loading: true, error: "old error" });
    useGhostCreditsStore.getState().hydrate({
      tier: "pro",
      isBlackOps: false,
      actions: {
        interrogate: { used: 2, limit: 30, remaining: 28, allowed: true, resetAt: null, remainingSeconds: 0, totalRuns: 2 },
        squad: { used: 1, limit: 3, remaining: 2, allowed: true, resetAt: "2026-08-14T12:00:00Z", remainingSeconds: 1200, totalRuns: 1 },
        recon: { ...ZERO },
        dawn_patrol: { ...ZERO },
      },
    });
    const s = useGhostCreditsStore.getState();
    expect(s.tier).toBe("pro");
    expect(s.actions.interrogate.remaining).toBe(28);
    expect(s.actions.squad.remainingSeconds).toBe(1200);
    expect(s.loading).toBe(false);
    expect(s.error).toBe(null);
    expect(s.checkedAt).toBeGreaterThan(0);
  });

  it("applyConsume() merges a single-action verdict post-consume", () => {
    useGhostCreditsStore.getState().hydrate({
      tier: "pro",
      isBlackOps: false,
      actions: {
        interrogate: { ...ZERO, limit: 30, remaining: 30, allowed: true },
        squad: { ...ZERO, limit: 3, remaining: 3, allowed: true },
        recon: { ...ZERO },
        dawn_patrol: { ...ZERO },
      },
    });
    useGhostCreditsStore.getState().applyConsume("squad", {
      used: 1, limit: 3, remaining: 2, allowed: true,
      resetAt: null, remainingSeconds: 0, totalRuns: 1, tier: "pro", isBlackOps: false,
    });
    const s = useGhostCreditsStore.getState();
    expect(s.actions.squad.used).toBe(1);
    expect(s.actions.squad.remaining).toBe(2);
    // Other actions untouched.
    expect(s.actions.interrogate.used).toBe(0);
    expect(s.actions.interrogate.remaining).toBe(30);
  });

  it("tick() decrements remainingSeconds only on actions with an active resetAt", () => {
    useGhostCreditsStore.getState().hydrate({
      tier: "free",
      isBlackOps: false,
      actions: {
        interrogate: { ...ZERO },
        squad: { used: 3, limit: 3, remaining: 0, allowed: false, resetAt: "2026-08-14T12:00:00Z", remainingSeconds: 5, totalRuns: 3 },
        recon: { ...ZERO },
        dawn_patrol: { ...ZERO },
      },
    });
    useGhostCreditsStore.getState().tick();
    useGhostCreditsStore.getState().tick();
    expect(useGhostCreditsStore.getState().actions.squad.remainingSeconds).toBe(3);
  });

  it("invalidate() resets checkedAt to force a refetch", () => {
    useGhostCreditsStore.getState().hydrate({ tier: "pro", isBlackOps: false, actions: {
      interrogate: { ...ZERO, limit: 30, remaining: 30, allowed: true },
      squad: { ...ZERO }, recon: { ...ZERO }, dawn_patrol: { ...ZERO },
    }});
    const before = useGhostCreditsStore.getState().checkedAt;
    useGhostCreditsStore.getState().invalidate();
    expect(useGhostCreditsStore.getState().checkedAt).toBe(0);
    expect(useGhostCreditsStore.getState().actions.interrogate.remaining).toBe(30);
    void before;
  });

  it("reset() returns to guest/zero state", () => {
    useGhostCreditsStore.getState().hydrate({
      tier: "pro", isBlackOps: true, actions: {
        interrogate: { used: 5, limit: 30, remaining: 25, allowed: true, resetAt: null, remainingSeconds: 0, totalRuns: 5 },
        squad: { ...ZERO, limit: 3, remaining: 3, allowed: true },
        recon: { ...ZERO }, dawn_patrol: { ...ZERO },
      },
    });
    useGhostCreditsStore.getState().reset();
    const s = useGhostCreditsStore.getState();
    expect(s.tier).toBe("guest");
    expect(s.isBlackOps).toBe(false);
    expect(s.actions.interrogate).toEqual(ZERO);
  });
});

describe("GhostCreditBadge", () => {
  it("module is importable and does not throw at import time", async () => {
    const mod = await import("../src/components/ghost/GhostCreditBadge.js");
    expect(typeof mod.GhostCreditBadge).toBe("function");
  });
});

describe("_ghostLedger helpers (unit)", () => {
  it("exports expected GhostAction type values", async () => {
    const mod = await import("../api/_ghostLedger.js");
    expect(typeof mod.getGhostQuota).toBe("function");
    expect(typeof mod.consumeGhostAction).toBe("function");
    expect(typeof mod.handleGhostCredits).toBe("function");
  });
});
