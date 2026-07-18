import { describe, expect, it } from "vitest";

import { formatElapsedSeconds } from "./progress-view";

/** Gate 4 mirror (see storyboard-view.test.ts). */
const BANNED = /pollinations|snapgen|fal\.ai|openrouter|gemini|deno|supabase edge|no api|api[\s-]?keys?|server maps/i;

describe("formatElapsedSeconds", () => {
  it.each([
    [0, "0s"],
    [1, "1s"],
    [45, "45s"],
    [59, "59s"],
    [60, "1m 00s"],
    [61, "1m 01s"],
    [90, "1m 30s"],
    [605, "10m 05s"],
    [3599, "59m 59s"],
  ])("%d seconds → %s", (input, expected) => {
    expect(formatElapsedSeconds(input)).toBe(expected);
  });

  it("clamps negatives and floors fractions (the clock never lies)", () => {
    expect(formatElapsedSeconds(-5)).toBe("0s");
    expect(formatElapsedSeconds(45.9)).toBe("45s");
    expect(formatElapsedSeconds(59.999)).toBe("59s");
  });

  it("output is trivially Gate 4 safe (digits and units only)", () => {
    for (const input of [0, 45, 61, 605]) {
      expect(BANNED.test(formatElapsedSeconds(input))).toBe(false);
    }
  });
});
