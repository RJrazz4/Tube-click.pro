/**
 * V1 API contract builders — POST /api/v1/thumbnail & /api/v1/storyboard
 *
 * Single source of truth for frontend payloads. Every builder output is
 * guaranteed to pass the strict Zod schemas in
 * apps/api/src/routes/validation/{thumbnail,storyboard}.ts
 * (proven by scripts/test-v1-contract.ts).
 *
 * Also exports V1Envelope — the v1 endpoints always respond
 * { success: true, data: {...} } / { success: false, error, code, fields? }.
 * NOTE: secureClient.fetchEdgeFunctionJson returns the RAW envelope; callers
 * must unwrap `.data` (the hooks in useTierAwareApi do this too).
 */

// ─── Envelope ────────────────────────────────────────────────────

export interface V1Envelope<T> {
  success: boolean;
  data?: T;
}

/** Tolerantly unwrap a v1 envelope (accepts an already-unwrapped body too). */
export function unwrapV1<T>(body: V1Envelope<T> | T | null | undefined): T | undefined {
  if (!body || typeof body !== "object") return undefined;
  const maybe = body as V1Envelope<T>;
  if ("data" in maybe && maybe.data && typeof maybe.data === "object") return maybe.data;
  return body as T;
}

// ─── Schema constants (mirror apps/api/src/routes/validation/*) ──

export const V1_IMAGE_BRANDS = ["Tube.Flash", "Tube.Pro", "Tube.Cinematic"] as const;
export type V1ImageBrand = (typeof V1_IMAGE_BRANDS)[number];
const BRAND_SET = new Set<string>(V1_IMAGE_BRANDS);

export const V1_ASPECTS = ["9:16", "16:9", "1:1", "4:5"] as const;
const ASPECT_SET = new Set<string>(V1_ASPECTS);

export const V1_STORYBOARD_ASPECTS = ["9:16", "16:9", "1:1"] as const;
const SB_ASPECT_SET = new Set<string>(V1_STORYBOARD_ASPECTS);

export type V1Tier = "free" | "premium";
/** App store tiers: "free" | "pro" | "enterprise" → Zod accepts only free|premium. */
export const toV1Tier = (rawTier: string): V1Tier => (rawTier === "free" ? "free" : "premium");

const nonEmpty = (s: string | undefined | null, fallback: string, max: number): string => {
  const v = (s ?? "").trim();
  return (v.length > 0 ? v : fallback).slice(0, max);
};

const clampInt = (n: unknown, min: number, max: number, fallback: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(max, Math.max(min, v));
};

// ─── POST /api/v1/thumbnail ──────────────────────────────────────

export interface V1ThumbnailBody {
  title: string;
  emotion: string;
  style: string;
  aspect_ratio: "9:16" | "16:9" | "1:1" | "4:5";
  count: number;
  tier: V1Tier;
  brand: V1ImageBrand;
}

export interface BuildV1ThumbnailArgs {
  title: string;
  emotion: string;
  style: string;
  aspectRatio: string;
  count: number;
  brand: string;
  /** Raw app tier from useTierConfig ("free" | "pro" | "enterprise"). */
  rawTier: string;
}

export function buildV1ThumbnailBody(a: BuildV1ThumbnailArgs): V1ThumbnailBody {
  return {
    title: nonEmpty(a.title, "Untitled video", 300),
    emotion: nonEmpty(a.emotion, "excited", 100),
    style: nonEmpty(a.style, "modern", 200),
    aspect_ratio: (ASPECT_SET.has(a.aspectRatio) ? a.aspectRatio : "16:9") as V1ThumbnailBody["aspect_ratio"],
    count: clampInt(a.count, 1, 4, 4),
    tier: toV1Tier(a.rawTier),
    brand: (BRAND_SET.has(a.brand) ? a.brand : "Tube.Pro") as V1ImageBrand,
  };
}

// ─── POST /api/v1/storyboard ─────────────────────────────────────

export interface V1StoryboardScene {
  scene_number: number;
  visual_prompt: string;
  motion_prompt?: string;
}

export interface V1StoryboardBody {
  topic: string;
  script?: string;
  scenes: V1StoryboardScene[];
  tier: V1Tier;
  brand: V1ImageBrand;
  aspect_ratio: "9:16" | "16:9" | "1:1";
}

export interface BuildV1StoryboardArgs {
  /** Any human topic — the raw script works too (truncated to 500 chars). */
  topic: string;
  /** Prompt for THIS scene (analysis prompt or fallback retry prompt). */
  prompt: string;
  sceneNumber: number;
  motionPrompt?: string;
  brand: string;
  rawTier: string;
  aspectRatio: string;
  /** Optional full script (≤10000 chars, gives the server scene context). */
  script?: string;
}

/**
 * Builds a single-scene v1 storyboard request. The per-scene pattern keeps
 * the UI's individual scene progress/retry/timeout logic intact while every
 * request passes the strict Zod scene schema (invalid enum fields like the
 * analysis beat_type labels "Opening Hook" are simply omitted — server
 * defaults apply).
 */
export function buildV1StoryboardBody(a: BuildV1StoryboardArgs): V1StoryboardBody {
  const scene: V1StoryboardScene = {
    scene_number: clampInt(a.sceneNumber, 1, 999, 1),
    visual_prompt: nonEmpty(a.prompt, "Cinematic scene, professional lighting", 2000),
  };
  const motion = (a.motionPrompt ?? "").trim();
  if (motion) scene.motion_prompt = motion.slice(0, 500);

  const body: V1StoryboardBody = {
    topic: nonEmpty(a.topic, "Untitled video", 500),
    scenes: [scene],
    tier: toV1Tier(a.rawTier),
    brand: (BRAND_SET.has(a.brand) ? a.brand : "Tube.Flash") as V1ImageBrand,
    aspect_ratio: (SB_ASPECT_SET.has(a.aspectRatio) ? a.aspectRatio : "16:9") as V1StoryboardBody["aspect_ratio"],
  };
  const script = (a.script ?? "").trim();
  if (script) body.script = script.slice(0, 10000);
  return body;
}
