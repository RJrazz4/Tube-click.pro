/**
 * tests/headroom.test.ts — Headroom Ghost Layer invariants.
 *
 * Validates the three compression strategies plus the safety invariants
 * called out in the Micro-Phase 1 spec:
 *   1. Never removes the human user message.
 *   2. Never breaks turn pairing (system ↔ user).
 *   3. Parse failures passthrough (silent no-op).
 *   4. Idempotent (double-wrap is a no-op).
 *   5. The disabled env flag works as a kill switch.
 *   6. Telemetry accumulates expected counters.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  compressHeadroom,
  resetHeadroomTelemetry,
  headroomTelemetrySnapshot,
} from "../packages/orchestrator/headroom/headroom.js";

describe("Headroom Ghost Layer — safety invariants", () => {
  beforeEach(() => {
    resetHeadroomTelemetry();
    delete process.env.GHOST_HEADROOM_ENABLED;
  });

  afterEach(() => {
    delete process.env.GHOST_HEADROOM_ENABLED;
  });

  it("short prompts pass through untouched (<1ms overhead path)", () => {
    const out = compressHeadroom({
      systemPrompt: "You are a critic.",
      userPrompt: "Score this script.",
    });
    expect(out.systemPrompt).toBe("You are a critic.");
    expect(out.userPrompt).toBe("Score this script.");
    expect(out.report.compressionRatio).toBe(0);
    expect(out.report.strategiesApplied).not.toContain("smart-crush");
  });

  it("never destroys the user message (even when the prompt is garbage)", () => {
    const user = "FINAL_INSTRUCTION: return the word BANANA in all caps.";
    const out = compressHeadroom({
      systemPrompt: "You are a system.",
      userPrompt: user + " {{" + "[".repeat(5000), // malformed JSON
    });
    // Critical: user message MUST still contain the final instruction verbatim.
    expect(out.userPrompt).toContain("FINAL_INSTRUCTION: return the word BANANA");
  });

  it("kill switch (GHOST_HEADROOM_ENABLED=false) disables all compression", () => {
    process.env.GHOST_HEADROOM_ENABLED = "false";
    const bigArray = Array.from({ length: 200 }, (_, i) => ({
      id: `item_${i}`,
      title: `Competitor video #${i} with a long viral title about growth hacking and retention loops`,
      views: Math.floor(Math.random() * 1_000_000),
      description: "x".repeat(600),
    }));
    const big = JSON.stringify(bigArray);
    const out = compressHeadroom({
      systemPrompt: "Analyze this list.",
      userPrompt: `Videos: ${big}`,
    });
    expect(out.report.strategiesApplied).toEqual(["disabled"]);
    expect(out.userPrompt.length).toBe(8 + big.length);
  });

  it("SmartCrush compresses long competitor-list JSON but keeps head+tail+outliers", () => {
    // 60 items with one MASSIVE outlier that must survive.
    const bigArray = Array.from({ length: 60 }, (_, i) => ({
      id: `v_${i}`,
      title: `video ${i}`,
      views: 10_000 + i * 100,
      description: i === 37 ? "OUTLIER " + "y".repeat(4_000) : "short",
    }));
    const userPrompt = `Competitors:\n${JSON.stringify(bigArray)}\n\nNow summarize top hooks.`;
    const out = compressHeadroom({
      systemPrompt: "You are an analyst.",
      userPrompt,
      relevanceHints: ["outlier"],
    });
    // Must have applied smart-crush.
    expect(out.report.strategiesApplied).toContain("smart-crush");
    // Must be strictly smaller.
    expect(out.userPrompt.length).toBeLessThan(userPrompt.length);
    // Head (v_0) and tail (v_59) must survive.
    expect(out.userPrompt).toContain('"id":"v_0"');
    expect(out.userPrompt).toContain('"id":"v_59"');
    // The huge outlier must survive (statistical anomaly).
    expect(out.userPrompt).toContain("OUTLIER");
    // Final instruction must still be present.
    expect(out.userPrompt).toContain("Now summarize top hooks.");
  });

  it("CacheAligner hoists identity preamble to line 0 for prefix-cache stability", () => {
    const out = compressHeadroom({
      systemPrompt: "\n\n\nMiscellaneous preamble noise that varies per call.\nYou are an elite YouTube growth strategist and institutional content director.\nOther invariant instructions.",
      userPrompt: "hi",
    });
    expect(out.systemPrompt.startsWith("You are an elite YouTube growth strategist")).toBe(true);
    expect(out.report.strategiesApplied).toContain("cache-align");
  });

  it("RollingWindow enforces budget when user prompt is far over maxUserChars", () => {
    const huge = JSON.stringify(
      Array.from({ length: 2000 }, (_, i) => ({
        id: `x_${i}`,
        blob: "b".repeat(200),
      })),
    );
    const out = compressHeadroom({
      systemPrompt: "You are an analyst.",
      userPrompt: `DATA: ${huge}\n\nReturn JSON summary.`,
      maxUserChars: 4_000,
    });
    expect(out.userPrompt.length).toBeLessThanOrEqual(4_200); // small tolerance for wrapper
    expect(out.report.strategiesApplied).toContain("rolling-window");
    expect(out.userPrompt).toContain("Return JSON summary.");
  });

  it("is idempotent: double-compressing yields the same strings", () => {
    const bigArray = Array.from({ length: 80 }, (_, i) => ({
      id: `v_${i}`,
      title: `video ${i}`,
      description: i === 40 ? "Z".repeat(2000) : "short",
    }));
    const userPrompt = `Competitors:\n${JSON.stringify(bigArray)}\n\nSummarize.`;
    const first = compressHeadroom({
      systemPrompt: "You are an analyst.",
      userPrompt,
    });
    // Reset telemetry so the second call isn't a no-op for the wrong reason.
    resetHeadroomTelemetry();
    const second = compressHeadroom({
      systemPrompt: first.systemPrompt,
      userPrompt: first.userPrompt,
    });
    expect(second.systemPrompt).toBe(first.systemPrompt);
    expect(second.userPrompt).toBe(first.userPrompt);
  });

  it("telemetry accumulates compression savings across calls", () => {
    resetHeadroomTelemetry();
    const bigArray = Array.from({ length: 80 }, (_, i) => ({
      id: `v_${i}`,
      description: i === 50 ? "Y".repeat(2000) : "s",
    }));
    compressHeadroom({
      systemPrompt: "sys",
      userPrompt: `LIST: ${JSON.stringify(bigArray)}`,
    });
    compressHeadroom({
      systemPrompt: "sys",
      userPrompt: `LIST: ${JSON.stringify(bigArray)}`,
    });
    const snap = headroomTelemetrySnapshot();
    expect(snap.calls).toBe(2);
    expect(snap.listsCrushed).toBeGreaterThanOrEqual(2);
    expect(snap.totalTokensSavedEstimate).toBeGreaterThan(0);
    expect(snap.totalCompressedChars).toBeLessThan(snap.totalOriginalChars);
  });

  it("malformed JSON slices never throw — passthrough safety", () => {
    const broken = "{ broken json [[[ } } ] not real " + "x".repeat(5000);
    expect(() =>
      compressHeadroom({
        systemPrompt: "sys",
        userPrompt: broken,
      }),
    ).not.toThrow();
    const out = compressHeadroom({ systemPrompt: "sys", userPrompt: broken });
    expect(out.userPrompt).toContain("broken json");
  });
});
