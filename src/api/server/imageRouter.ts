/**
 * Phase C1 Blueprint — Model Mapping Logic: White-Label Image API
 * Maps our custom brand names to free/hybrid providers.
 * This is the core of Tube.Flash / Tube.Pro white-label strategy.
 */

export type ImageModelBrand = "Tube.Flash" | "Tube.Pro" | "Tube.Cinematic";

export interface ImageModelConfig {
  brand: ImageModelBrand;
  provider: "pollinations" | "fal" | "snapgen";
  modelId: string;
  costTier: "free" | "pro";
  description: string;
}

export const IMAGE_MODEL_MAP: Record<ImageModelBrand, ImageModelConfig> = {
  "Tube.Flash": {
    brand: "Tube.Flash",
    provider: "pollinations",
    modelId: "flux-fast", // via https://image.pollinations.ai/prompt/{prompt}
    costTier: "free",
    description: "Ultra-fast free tier — Pollinations AI, no API key, perfect for thumbnails preview",
  },
  "Tube.Pro": {
    brand: "Tube.Pro",
    provider: "fal",
    modelId: "fal-ai/fast-lightning-sdxl",
    costTier: "pro",
    description: "Premium quality — Fal.ai Lightning SDXL 4 steps, server-side key, high-res YouTube thumbnails",
  },
  "Tube.Cinematic": {
    brand: "Tube.Cinematic",
    provider: "fal",
    modelId: "fal-ai/flux-pro", // future upgrade
    costTier: "pro",
    description: "Cinematic storyboard frames — future Flux Pro for filmic quality",
  },
};

export function resolveImageModel(brand: ImageModelBrand): ImageModelConfig {
  return IMAGE_MODEL_MAP[brand] || IMAGE_MODEL_MAP["Tube.Pro"];
}

/**
 * Server-side image generation endpoint blueprint
 * Route: /api/generate-image (Vercel Edge) or supabase/functions/generate-thumbnail
 * Body: { prompt, brand: "Tube.Flash"|"Tube.Pro", aspectRatio, style }
 * Logic:
 *  if brand == Tube.Flash -> call pollinations free API (no key, but route through server to hide logic)
 *  if brand == Tube.Pro -> call Fal.ai with FAL_API_KEY from Deno.env
 */

export const IMAGE_ROUTER_BLUEPRINT = {
  brands: IMAGE_MODEL_MAP,
  secure: "All provider keys in server env, brand mapping server-side only. Client only sends brand string.",
  previewOptimization: "Frontend plays static preview MP3/image placeholder, only generates on demand to save quota",
};
