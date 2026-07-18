import { describe, expect, it } from "vitest";

import { buildDirectorSystemPrompt, buildDirectorUserPrompt } from "./system-prompt.js";

describe("buildDirectorSystemPrompt", () => {
  it("embeds the exact DirectorOutput contract keys", () => {
    const prompt = buildDirectorSystemPrompt();
    for (const key of [
      '"characterProfile"',
      '"scenes"',
      '"complexity"',
      '"SIMPLE" | "COMPLEX"',
      '"aspectRatio"',
      '"routingHint"',
      '"prefer-premium"',
    ]) {
      expect(prompt).toContain(key);
    }
  });

  it("forbids markdown fences and invented characters", () => {
    const prompt = buildDirectorSystemPrompt();
    expect(prompt).toMatch(/No markdown fences/i);
    expect(prompt).toMatch(/Never invent one/i);
  });

  it("writes the tier cap when maxScenes is provided", () => {
    expect(buildDirectorSystemPrompt({ maxScenes: 4 })).toContain("AT MOST 4 scenes");
  });

  it("omits the numeric cap when unbounded", () => {
    expect(buildDirectorSystemPrompt()).not.toContain("AT MOST");
  });
});

describe("buildDirectorUserPrompt", () => {
  it("wraps the script with explicit delimiters and JSON-only demand", () => {
    const prompt = buildDirectorUserPrompt("Once upon a time");
    expect(prompt).toContain("Once upon a time");
    expect(prompt).toContain("SCRIPT BEGINS");
    expect(prompt).toContain("SCRIPT ENDS");
    expect(prompt).toContain("ONLY the DirectorOutput JSON");
  });
});
