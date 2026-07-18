/**
 * Phase B2 — Manager Agent system prompt engineering.
 *
 * Forces the manager LLM (JSON mode) to emit exactly the DirectorOutput
 * contract from A3: { characterProfile, scenes: [...] }. The prompt is
 * the single source of the complexity rubric — B3's heuristics mirror
 * these definitions to catch misclassification.
 */

export interface DirectorPromptOptions {
  /** Tier-driven scene cap written into the prompt (F enforcement stays server-side). */
  maxScenes?: number;
}

export function buildDirectorSystemPrompt(options: DirectorPromptOptions = {}): string {
  const capLine =
    options.maxScenes !== undefined
      ? `Plan AT MOST ${options.maxScenes} scenes — if the script has more beats, keep only the strongest visual moments.`
      : "Plan as many scenes as the script genuinely needs, no padding.";

  return [
    "You are the Director of a YouTube storyboard pipeline. Read the script and",
    "decompose it into a shot list for AI image generation.",
    "",
    "OUTPUT CONTRACT (mandatory):",
    "- Reply with ONE raw JSON object and nothing else. No markdown fences, no commentary.",
    "- The object MUST match this exact shape:",
    "{",
    '  "characterProfile": {',
    '    "name": string,',
    '    "description": string,  // canonical visual description, reused in every scene',
    '    "styleGuide": string,   // art-direction anchors, e.g. "cinematic, 35mm, muted teal"',
    '    "negativePrompt": string',
    "  } | null,",
    '  "scenes": [',
    "    {",
    '      "index": number,           // 0-based, consecutive',
    '      "title": string,           // 2-6 word UI label',
    '      "prompt": string,          // fully self-contained image prompt',
    '      "negativePrompt": string,',
    '      "complexity": "SIMPLE" | "COMPLEX",',
    '      "aspectRatio": "16:9" | "9:16" | "1:1",',
    '      "routingHint": "auto" | "prefer-premium" | "prefer-free"',
    "    }",
    "  ]",
    "}",
    "",
    "COMPLEXITY RUBRIC:",
    '- SIMPLE  = scenery, skies, landscapes, still objects, abstract backgrounds — NO people.',
    '- COMPLEX = people or faces, emotions, action/movement, interactions, hands,',
    "            text-in-image, or anything where detail errors are obvious.",
    "",
    "ROUTING HINTS:",
    '- "prefer-premium" for COMPLEX scenes, "prefer-free" for SIMPLE scenes, "auto" if unsure.',
    "",
    "RULES:",
    "- characterProfile is null when the script has NO recurring person/character.",
    "  Never invent one.",
    "- When a character exists, fold their canonical description into EVERY scene",
    "  prompt where they appear — each prompt must stand alone.",
    `- ${capLine}`,
    '- Default aspectRatio is "16:9" (YouTube); use "9:16" only for vertical/Shorts beats.',
    "- negativePrompts target common failure modes: blurry, extra fingers, watermark,",
    "  deformed face, lowres, text artifacts.",
    "- Every scene needs a distinct visual beat; no duplicate compositions.",
  ].join("\n");
}

export function buildDirectorUserPrompt(script: string): string {
  return [
    "SCRIPT BEGINS",
    "-------------",
    script,
    "-------------",
    "SCRIPT ENDS — reply with ONLY the DirectorOutput JSON object.",
  ].join("\n");
}
