/**
 * Phase G2 — White-Label Image Routing Engine — PARTIALLY PURGED
 * Image generation API calls removed. Types and stubs retained for legacy page compilation.
 * Active image generation has been moved to the orchestrator pipeline.
 */

export type ImageModelBrand = "Tube.Flash" | "Tube.Pro" | "Tube.Cinematic";

export type ImageProvider = "pollinations" | "snapgen" | "fal";

export interface ImageModelConfig {
  brand: ImageModelBrand;
  provider: ImageProvider;
  fallbackProviders: ImageProvider[];
  modelId: string;
  costTier: "free" | "pro";
  description: string;
  quality: "fast" | "balanced" | "premium";
  avgLatencyMs: number;
  usesApiKey: boolean;
}

/** @deprecated Image generation purged. Kept for legacy page compilation. */
export const IMAGE_MODEL_MAP: Record<ImageModelBrand, ImageModelConfig> = {
  "Tube.Flash": {
    brand: "Tube.Flash",
    provider: "pollinations",
    fallbackProviders: ["snapgen"],
    modelId: "flux",
    costTier: "free",
    description: "Ultra-fast instant tier — ~2-3s generation",
    quality: "fast",
    avgLatencyMs: 2500,
    usesApiKey: false,
  },
  "Tube.Pro": {
    brand: "Tube.Pro",
    provider: "snapgen",
    fallbackProviders: ["fal", "pollinations"],
    modelId: "snapgen-v1",
    costTier: "free",
    description: "Pro-grade tier — higher fidelity",
    quality: "balanced",
    avgLatencyMs: 3500,
    usesApiKey: false,
  },
  "Tube.Cinematic": {
    brand: "Tube.Cinematic",
    provider: "fal",
    fallbackProviders: ["snapgen", "pollinations"],
    modelId: "fal-ai/fast-lightning-sdxl",
    costTier: "pro",
    description: "Cinema-grade premium tier — maximum detail",
    quality: "premium",
    avgLatencyMs: 8000,
    usesApiKey: true,
  },
};

export function resolveImageModel(brand: string): ImageModelConfig {
  const normalized = (brand as ImageModelBrand) || "Tube.Pro";
  return IMAGE_MODEL_MAP[normalized] || IMAGE_MODEL_MAP["Tube.Pro"];
}

/** @deprecated Image generation purged. Kept for legacy page compilation. */
export function buildImageUrls(params: {
  brand: ImageModelBrand;
  prompt: string;
  width: number;
  height: number;
  falSize: string;
  seed: number;
}): { primary: string; provider: ImageProvider; fallbackUrls: string[] } {
  const encodedPrompt = encodeURIComponent(params.prompt);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${params.width}&height=${params.height}&nologo=true&seed=${params.seed}&model=flux`;
  const snapgenUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${params.width}&height=${params.height}&nologo=true&seed=${params.seed + 1000}&model=turbo&enhance=true`;
  return { primary: pollinationsUrl, provider: "pollinations", fallbackUrls: [snapgenUrl] };
}
