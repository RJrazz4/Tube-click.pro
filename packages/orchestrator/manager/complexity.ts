/**
 * Phase B3 — Complexity classifier: heuristic verification of LLM tags.
 *
 * The manager LLM tags each scene SIMPLE/COMPLEX (B2 rubric). This module
 * independently scores the scene text and overrides the tag when the LLM
 * is clearly wrong:
 *
 *   upgrade   LLM said SIMPLE  but character/action signals → COMPLEX
 *   downgrade LLM said COMPLEX but ONLY scenery/object signals → SIMPLE
 *   else      keep the LLM tag (ambiguous heat: trust the manager)
 *
 * Upgrades protect quality (a face on a free model looks broken).
 * Downgrades protect margin (scenery on a premium model burns cost).
 * Routing hints are re-synced to the final complexity.
 */
import type { SceneComplexity, ScenePlan } from "../types/index.js";

interface Signal {
  label: string;
  pattern: RegExp;
  weight: number;
}

/** Characters are the premium discriminator — any hit forces COMPLEX. */
const CHARACTER_SIGNALS: Signal[] = [
  {
    label: "person",
    pattern:
      /\b(man|woman|men|women|girl|boy|child|kid|person|people|human|face|faces|portrait|character|hero|heroine|villain|narrator|presenter|host|teacher|doctor|mother|father|friend|crowd)\b/i,
    weight: 2,
  },
  {
    label: "body",
    pattern: /\b(hands?|fingers?|eyes?|smile|smiling|laughing|crying|expression|facial)\b/i,
    weight: 2,
  },
  {
    label: "emotion",
    pattern: /\b(angry|furious|sad|happy|joyful|shocked|surprised|fearful|determined|emotional)\b/i,
    weight: 1,
  },
];

const ACTION_SIGNALS: Signal[] = [
  {
    label: "action",
    pattern:
      /\b(running|run|fighting|fight|jumping|jump|chasing|chase|racing|battle|explosion|exploding|screaming|shouting|dancing|driving|flying|crashing|crash)\b/i,
    weight: 2,
  },
  {
    label: "interaction",
    pattern: /\b(holding|pointing|grabbing|shaking hands|hugging|arguing|talking to|staring at)\b/i,
    weight: 2,
  },
];

const DETAIL_SIGNALS: Signal[] = [
  { label: "text-logo", pattern: /\b(text|logo|typography|lettering|headline)\b/i, weight: 1 },
];

const SIMPLE_SIGNALS: Signal[] = [
  {
    label: "scenery",
    pattern:
      /\b(sky|skies|clouds?|sunset|sunrise|dawn|dusk|horizon|mountains?|ocean|sea|beach|forest|field|meadow|valley|landscape|cityscape|skyline|river|lake)\b/i,
    weight: 1,
  },
  {
    label: "plain-object",
    pattern: /\b(cup|mug|bottle|book|desk|table|chair|keyboard|plant|vase|lantern|typewriter)\b/i,
    weight: 1,
  },
  {
    label: "abstract-bg",
    pattern: /\b(abstract|gradient|bokeh|wallpaper|background|texture)\b/i,
    weight: 1,
  },
];

export interface ComplexityAssessment {
  complexity: SceneComplexity;
  /** Weighted: complex signals minus simple signals. */
  score: number;
  /** Human-readable matched signal labels (for analytics/debug). */
  signals: string[];
  complexSignalCount: number;
  simpleSignalCount: number;
  /** Hard rule: any person/body signal forces COMPLEX. */
  charactersDetected: boolean;
}

function collectSignals(text: string, groups: Signal[][]): { score: number; labels: string[] } {
  let score = 0;
  const labels: string[] = [];
  for (const group of groups) {
    for (const signal of group) {
      if (signal.pattern.test(text)) {
        score += signal.weight;
        labels.push(signal.label);
      }
    }
  }
  return { score, labels };
}

/** Pure heuristic scoring over scene text. */
export function assessComplexity(text: string): ComplexityAssessment {
  const complex = collectSignals(text, [CHARACTER_SIGNALS, ACTION_SIGNALS, DETAIL_SIGNALS]);
  const simple = collectSignals(text, [SIMPLE_SIGNALS]);
  const charactersDetected = complex.labels.some((l) => l === "person" || l === "body");

  let complexity: SceneComplexity;
  if (charactersDetected || complex.score >= 2) {
    complexity = "COMPLEX";
  } else if (complex.score === 0 && simple.score >= 1) {
    complexity = "SIMPLE";
  } else {
    complexity = complex.score > simple.score ? "COMPLEX" : "SIMPLE";
  }

  return {
    complexity,
    score: complex.score - simple.score,
    signals: [...complex.labels, ...simple.labels],
    complexSignalCount: complex.labels.length,
    simpleSignalCount: simple.labels.length,
    charactersDetected,
  };
}

export interface RefinedScene {
  scene: ScenePlan;
  assessment: ComplexityAssessment;
  /** True when heuristics flipped the LLM's tag. */
  overridden: boolean;
  /** "heuristic-override" | "llm" */
  tagSource: "heuristic-override" | "llm";
}

/** Verify (and possibly correct) one scene's LLM-assigned complexity. */
export function refineScene(scene: ScenePlan): RefinedScene {
  const assessment = assessComplexity(`${scene.title}. ${scene.prompt}`);
  let complexity = scene.complexity;
  let overridden = false;

  const shouldUpgrade =
    scene.complexity === "SIMPLE" &&
    (assessment.charactersDetected || assessment.score >= 2);
  const shouldDowngrade =
    scene.complexity === "COMPLEX" &&
    assessment.complexSignalCount === 0 &&
    assessment.simpleSignalCount >= 1;

  if (shouldUpgrade) {
    complexity = "COMPLEX";
    overridden = true;
  } else if (shouldDowngrade) {
    complexity = "SIMPLE";
    overridden = true;
  }

  const routingHint = overridden
    ? complexity === "COMPLEX"
      ? "prefer-premium"
      : "prefer-free"
    : scene.routingHint;

  return {
    scene: { ...scene, complexity, routingHint },
    assessment,
    overridden,
    tagSource: overridden ? "heuristic-override" : "llm",
  };
}

/** Batch refinement for a whole storyboard, with an override count for metrics. */
export function refineScenes(scenes: ScenePlan[]): { scenes: ScenePlan[]; overrides: number } {
  let overrides = 0;
  const refined = scenes.map((scene) => {
    const r = refineScene(scene);
    if (r.overridden) overrides += 1;
    return r.scene;
  });
  return { scenes: refined, overrides };
}
