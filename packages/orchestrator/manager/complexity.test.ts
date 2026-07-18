import { describe, expect, it } from "vitest";

import type { ScenePlan } from "../types/index.js";

import { assessComplexity, refineScene, refineScenes } from "./complexity.js";

const scene = (over: Partial<ScenePlan> = {}): ScenePlan => ({
  index: 0,
  title: "Untitled",
  prompt: "",
  negativePrompt: "",
  complexity: "SIMPLE",
  aspectRatio: "16:9",
  routingHint: "auto",
  ...over,
});

describe("assessComplexity (heuristic scoring)", () => {
  it("flags people as COMPLEX with charactersDetected", () => {
    const a = assessComplexity("a woman presenting to camera");
    expect(a.complexity).toBe("COMPLEX");
    expect(a.charactersDetected).toBe(true);
    expect(a.signals).toContain("person");
  });

  it("flags action and body language as COMPLEX", () => {
    expect(assessComplexity("two fighters clashing, sparks flying").complexity).toBe("COMPLEX");
    expect(assessComplexity("close-up of trembling hands").complexity).toBe("COMPLEX");
  });

  it("reads pure scenery as SIMPLE", () => {
    const a = assessComplexity("empty mountain valley at dawn, clouds over the river");
    expect(a.complexity).toBe("SIMPLE");
    expect(a.charactersDetected).toBe(false);
    expect(a.simpleSignalCount).toBeGreaterThanOrEqual(1);
  });

  it("reads still objects as SIMPLE (per the plan's rubric)", () => {
    expect(assessComplexity("a coffee mug on a wooden table, bokeh background").complexity).toBe("SIMPLE");
  });

  it("emotion + person beats scenery weight", () => {
    const a = assessComplexity("a woman running through a field");
    expect(a.complexity).toBe("COMPLEX");
    expect(a.score).toBeGreaterThan(0);
  });
});

describe("refineScene (LLM tag verification)", () => {
  it("UPGRADES an LLM-SIMPLE scene with character signals to COMPLEX", () => {
    const r = refineScene(
      scene({ complexity: "SIMPLE", routingHint: "prefer-free", prompt: "a woman smiling at the camera" }),
    );
    expect(r.overridden).toBe(true);
    expect(r.tagSource).toBe("heuristic-override");
    expect(r.scene.complexity).toBe("COMPLEX");
    expect(r.scene.routingHint).toBe("prefer-premium");
  });

  it("DOWNGRADES an LLM-COMPLEX scene with only scenery signals to SIMPLE", () => {
    const r = refineScene(
      scene({ complexity: "COMPLEX", routingHint: "prefer-premium", title: "Valley", prompt: "empty mountain valley at dawn" }),
    );
    expect(r.overridden).toBe(true);
    expect(r.scene.complexity).toBe("SIMPLE");
    expect(r.scene.routingHint).toBe("prefer-free");
  });

  it("keeps the LLM tag when ambiguous (manager is trusted)", () => {
    const r = refineScene(
      scene({ complexity: "COMPLEX", prompt: "a mysterious glowing portal, humming softly" }),
    );
    expect(r.overridden).toBe(false);
    expect(r.tagSource).toBe("llm");
    expect(r.scene.complexity).toBe("COMPLEX");
  });

  it("keeps a confirmed SIMPLE tag", () => {
    const r = refineScene(scene({ complexity: "SIMPLE", prompt: "sunset over the ocean" }));
    expect(r.overridden).toBe(false);
    expect(r.scene.complexity).toBe("SIMPLE");
  });
});

describe("refineScenes (batch)", () => {
  it("returns refined scenes with an override count for metrics", () => {
    const { scenes, overrides } = refineScenes([
      scene({ index: 0, prompt: "a woman smiling", complexity: "SIMPLE" }),
      scene({ index: 1, prompt: "sunset over the ocean", complexity: "SIMPLE" }),
    ]);
    expect(overrides).toBe(1);
    expect(scenes[0].complexity).toBe("COMPLEX");
    expect(scenes[1].complexity).toBe("SIMPLE");
  });
});
