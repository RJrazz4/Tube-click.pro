/**
 * Phase C1/C2 — canonical pixel dimensions per aspect ratio.
 * 16:9 is the YouTube default; sizes sized for free-tier friendliness.
 */
import type { AspectRatio } from "../types/index.js";

export interface PixelSize {
  width: number;
  height: number;
}

export const ASPECT_RATIO_PIXELS: Record<AspectRatio, PixelSize> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1024, height: 1024 },
};

export function aspectRatioPixels(aspectRatio: AspectRatio): PixelSize {
  return ASPECT_RATIO_PIXELS[aspectRatio];
}

/** OpenAI-images-style "WxH" string (agnes-compatible vendors). */
export function aspectRatioSizeString(aspectRatio: AspectRatio): string {
  const { width, height } = ASPECT_RATIO_PIXELS[aspectRatio];
  return `${width}x${height}`;
}
