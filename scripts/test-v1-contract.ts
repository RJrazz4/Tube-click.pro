/**
 * V1 frontend contract proof — validates the EXACT payloads the React pages
 * send (built by src/lib/v1Payloads.ts) against the REAL strict Zod schemas
 * used by the live edge functions (apps/api/src/routes/validation/*).
 *
 * Run:  node_modules/.bin/esbuild scripts/test-v1-contract.ts --bundle \
 *         --platform=node --format=esm --outfile=/tmp/test-v1.mjs && node /tmp/test-v1.mjs
 */

import { validateThumbnailRequest } from "../apps/api/src/routes/validation/thumbnail";
import { validateStoryboardRequest } from "../apps/api/src/routes/validation/storyboard";
import {
  buildV1ThumbnailBody,
  buildV1StoryboardBody,
  buildV1StoryboardScenesBody,
} from "../src/lib/v1Payloads";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`, detail ?? ""); }
};

console.log("\n[1] Thumbnails page payloads → thumbnailRequestSchema");
const thumbCases: Array<[string, ReturnType<typeof buildV1ThumbnailBody>]> = [
  ["happy path (16:9, pro tier, Tube.Pro)", buildV1ThumbnailBody({ title: "I Tried MrBeast's Diet", emotion: "shocked", style: "cinematic", aspectRatio: "16:9", count: 4, brand: "Tube.Pro", rawTier: "pro" })],
  ["shorts (9:16, free tier)", buildV1ThumbnailBody({ title: "Quick tip", emotion: "happy", style: "minimal", aspectRatio: "9:16", count: 2, brand: "Tube.Flash", rawTier: "free" })],
  ["overlong title (600ch) → truncated ≤300", buildV1ThumbnailBody({ title: "x".repeat(600), emotion: "e", style: "s", aspectRatio: "16:9", count: 1, brand: "Tube.Cinematic", rawTier: "enterprise" })],
  ["count 99 → clamped to 4", buildV1ThumbnailBody({ title: "t", emotion: "e", style: "s", aspectRatio: "16:9", count: 99, brand: "Tube.Flash", rawTier: "free" })],
  ["garbage aspect '4:3' → default 16:9", buildV1ThumbnailBody({ title: "t", emotion: "e", style: "s", aspectRatio: "4:3", count: 1, brand: "Tube.Flash", rawTier: "free" })],
  ["garbage brand → default Tube.Pro", buildV1ThumbnailBody({ title: "t", emotion: "e", style: "s", aspectRatio: "16:9", count: 1, brand: "evil-brand", rawTier: "free" })],
  ["empty emotion/style → safe fallbacks", buildV1ThumbnailBody({ title: "t", emotion: "  ", style: "", aspectRatio: "16:9", count: 1, brand: "Tube.Flash", rawTier: "free" })],
];
for (const [name, body] of thumbCases) {
  const r = validateThumbnailRequest(body);
  check(name, !r.errors, r.errors);
}

console.log("\n[2] Storyboard page per-scene payloads → storyboardRequestSchema");
const sbCases: Array<[string, ReturnType<typeof buildV1StoryboardBody>]> = [
  ["happy path (analysis prompt, pro)", buildV1StoryboardBody({ topic: "How to cook pasta perfectly", prompt: "Wide cinematic shot of a steaming pasta bowl, rustic kitchen, golden hour", sceneNumber: 1, motionPrompt: "slow push-in", brand: "Tube.Pro", rawTier: "pro", aspectRatio: "16:9", script: "Full script...".repeat(50) })],
  ["retry fallback prompt (no motion)", buildV1StoryboardBody({ topic: "t", prompt: "Professional photo, person with happy expression, cinematic lighting", sceneNumber: 3, brand: "Tube.Flash", rawTier: "free", aspectRatio: "9:16" })],
  ["visual_prompt 5000ch → ≤2000", buildV1StoryboardBody({ topic: "t", prompt: "p".repeat(5000), sceneNumber: 1, brand: "Tube.Flash", rawTier: "free", aspectRatio: "16:9" })],
  ["motion 800ch → ≤500", buildV1StoryboardBody({ topic: "t", prompt: "ok", sceneNumber: 2, motionPrompt: "m".repeat(800), brand: "Tube.Flash", rawTier: "free", aspectRatio: "16:9" })],
  ["empty topic → 'Untitled video'", buildV1StoryboardBody({ topic: "   ", prompt: "ok", sceneNumber: 1, brand: "Tube.Flash", rawTier: "free", aspectRatio: "16:9" })],
  ["script 20000ch → ≤10000", buildV1StoryboardBody({ topic: "t", prompt: "ok", sceneNumber: 1, brand: "Tube.Cinematic", rawTier: "enterprise", aspectRatio: "1:1", script: "s".repeat(20000) })],
  ["scene_number 0 → clamped ≥1", buildV1StoryboardBody({ topic: "t", prompt: "ok", sceneNumber: 0, brand: "Tube.Flash", rawTier: "free", aspectRatio: "16:9" })],
];
for (const [name, body] of sbCases) {
  const r = validateStoryboardRequest(body);
  check(name, !r.errors, r.errors);
}

console.log("\n[2b] Orchestrator client BATCH payloads → storyboardRequestSchema");
const batchBase = { brand: "Tube.Flash", rawTier: "free", aspectRatio: "16:9" };
const batchCases: Array<[string, ReturnType<typeof buildV1StoryboardScenesBody>]> = [
  ["10 analyzed scenes → batch valid", buildV1StoryboardScenesBody({ topic: "Pasta masterclass script", scenes: Array.from({ length: 10 }, (_, i) => ({ sceneNumber: i + 1, prompt: `scene ${i + 1} visual`, ...(i % 2 ? {} : { motionPrompt: "slow zoom" }) })), script: "s".repeat(500), ...batchBase })],
  ["empty scenes[] → 1 safe fallback scene (min 1)", buildV1StoryboardScenesBody({ topic: "t", scenes: [], ...batchBase })],
  ["150 scenes → sliced to 100 (max)", buildV1StoryboardScenesBody({ topic: "t", scenes: Array.from({ length: 150 }, (_, i) => ({ sceneNumber: i + 1, prompt: "p" })), ...batchBase })],
  ["scene_number 0/NaN → clamped ≥1", buildV1StoryboardScenesBody({ topic: "t", scenes: [{ sceneNumber: 0, prompt: "p" }, { sceneNumber: Number.NaN, prompt: "q" }], ...batchBase })],
  ["pro tier + Tube.Pro brand passthrough", buildV1StoryboardScenesBody({ topic: "t", scenes: [{ sceneNumber: 1, prompt: "p" }], brand: "Tube.Pro", rawTier: "pro", aspectRatio: "9:16" })],
];
for (const [name, body] of batchCases) {
  const r = validateStoryboardRequest(body);
  check(name, !r.errors, r.errors);
}

console.log("\n[3] Schema hard-rejects still work (sanity)");
check("bad tier rejected", !!validateThumbnailRequest({ title: "t", emotion: "e", style: "s", tier: "gold" } as never).errors);
check("missing title rejected", !!validateThumbnailRequest({ emotion: "e", style: "s" } as never).errors);
check("storyboard beat_type 'Opening Hook' rejected (why UI omits it)", !!validateStoryboardRequest({ topic: "t", scenes: [{ scene_number: 1, visual_prompt: "p", beat_type: "Opening Hook" }] } as never).errors);
check("empty scenes[] rejected", !!validateStoryboardRequest({ topic: "t", scenes: [] } as never).errors);

console.log(`\nRESULT: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
