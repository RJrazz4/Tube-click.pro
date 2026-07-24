import { describe, expect, it } from "vitest";
import { analyzeTitleLocally } from "../src/lib/intelligence/localAnalysis";

describe("local intelligence engine", () => {
  it("returns explainable, bounded editorial signals without a network call", () => {
    const result = analyzeTitleLocally("How I Grew a YouTube Channel from 0 to 10,000 Subscribers");
    expect(result.method).toBe("local-rules");
    expect(result.signals).toHaveLength(5);
    expect(result.signals.every((signal) => signal.score >= 0 && signal.score <= 100)).toBe(true);
    expect(result.signals.every((signal) => signal.reason.length > 0)).toBe(true);
    expect(result.nextMove).toContain("Rewrite");
  });

  it("handles empty input safely", () => {
    const result = analyzeTitleLocally("");
    expect(result.input).toBe("");
    expect(result.signals).toHaveLength(5);
  });
});
