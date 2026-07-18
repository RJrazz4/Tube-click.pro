import { describe, expect, it } from "vitest";

import {
  directorOutputSchema,
  MAX_SCENES_PER_STORYBOARD,
  scenePlanSchema,
} from "./director-schema.js";

const scene = (over: Record<string, unknown> = {}) => ({
  index: 0,
  title: "Opening sky",
  prompt: "wide dawn sky over valley",
  complexity: "SIMPLE",
  aspectRatio: "16:9",
  routingHint: "auto",
  ...over,
});

describe("scenePlanSchema", () => {
  it("accepts a minimal scene and defaults negativePrompt", () => {
    const parsed = scenePlanSchema.parse(scene());
    expect(parsed.negativePrompt).toBe("");
  });

  it("strips unknown keys instead of failing (LLM-tolerant)", () => {
    const parsed = scenePlanSchema.parse(scene({ notes: "junk" }));
    expect("notes" in parsed).toBe(false);
  });

  it("rejects out-of-enum complexity", () => {
    expect(scenePlanSchema.safeParse(scene({ complexity: "MEDIUM" })).success).toBe(false);
  });

  it("rejects missing core fields", () => {
    const { title: _dropped, ...noTitle } = scene();
    expect(scenePlanSchema.safeParse(noTitle).success).toBe(false);
  });

  it("accepts 1-based indices (B4 re-indexes)", () => {
    expect(scenePlanSchema.safeParse(scene({ index: 1 })).success).toBe(true);
  });
});

describe("directorOutputSchema", () => {
  it("accepts a null character profile for characterless scripts", () => {
    const parsed = directorOutputSchema.parse({ characterProfile: null, scenes: [scene()] });
    expect(parsed.characterProfile).toBeNull();
  });

  it("accepts a full character profile", () => {
    const parsed = directorOutputSchema.parse({
      characterProfile: {
        name: "Ava",
        description: "silver braid, green cloak",
        styleGuide: "cinematic",
        negativePrompt: "blurry",
      },
      scenes: [scene()],
    });
    expect(parsed.characterProfile?.name).toBe("Ava");
  });

  it("rejects zero scenes", () => {
    expect(directorOutputSchema.safeParse({ characterProfile: null, scenes: [] }).success).toBe(false);
  });

  it(`caps scenes at ${MAX_SCENES_PER_STORYBOARD} (injection guard)`, () => {
    const many = Array.from({ length: MAX_SCENES_PER_STORYBOARD }, (_, i) => scene({ index: i }));
    expect(directorOutputSchema.safeParse({ characterProfile: null, scenes: many }).success).toBe(true);
    expect(
      directorOutputSchema.safeParse({
        characterProfile: null,
        scenes: [...many, scene({ index: MAX_SCENES_PER_STORYBOARD })],
      }).success,
    ).toBe(false);
  });
});
