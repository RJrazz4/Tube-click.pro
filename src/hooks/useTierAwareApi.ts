/**
 * Phase 5 — useTierAwareApi
 *
 * React hooks that wrap the Phase 4 API endpoints (`/api/v1/storyboard`,
 * `/api/v1/thumbnail`) with automatic tier awareness.
 *
 * Each hook:
 *   1. Reads the user's tier from `useTierConfig`.
 *   2. Prepares the request body with tier info so the server enforces limits.
 *   3. Interprets the server response — including `truncated`, `upgrade_message`,
 *      and `limits` fields — and surfaces them for UI display.
 *   4. Provides React Query caching for instant revisit.
 *
 * Calling these hooks directly replaces individual `fetchEdgeFunctionJson` calls.
 */

import { useMutation } from "@tanstack/react-query";
import { fetchEdgeFunctionJson, EdgeFunctionError } from "@/api/client/secureClient";
import { QK } from "@/api/client/queryKeys";
import { useTierConfig, type AppTier } from "./useTierConfig";
import { unwrapV1, type V1Envelope } from "@/lib/v1Payloads";
import { useAppStore } from "@/stores/useAppStore";
import { toast } from "sonner";

/* ------------------------------------------------------------------ *
 * Types matching the Phase 4 backend response shapes
 * ------------------------------------------------------------------ */

// ─── Storyboard ──────────────────────────────────────────────────

export interface SceneInput {
  scene_number: number;
  visual_prompt: string;
  motion_prompt?: string;
  duration?: number;
  transition?: "cut" | "fade" | "dissolve" | "slide" | "zoom";
  beat_type?: "intro" | "hook" | "content" | "climax" | "outro";
}

export interface SceneOutput {
  scene_number: number;
  image_url: string;
  provider: string;
  from_fallback: boolean;
  duration: number;
  transition: string;
  beat_type: string;
  degraded: boolean;
}

export interface StoryboardResponseData {
  topic: string;
  tier: string;
  brand: string;
  aspect_ratio: string;
  scenes: SceneOutput[];
  total_scenes: number;
  requested_scenes: number;
  truncated: boolean;
  upgrade_message?: string;
  limits: {
    max_scenes: number;
    allowed_brands: string[];
  };
}

// ─── Thumbnail ───────────────────────────────────────────────────

export interface ThumbnailOutput {
  index: number;
  url: string;
  provider: string;
  from_fallback: boolean;
  info?: string;
}

export interface ThumbnailResponseData {
  title: string;
  emotion: string;
  style: string;
  aspect_ratio: string;
  tier: string;
  brand: string;
  thumbnails: ThumbnailOutput[];
  total_generated: number;
  requested: number;
  truncated: boolean;
  upgrade_message?: string;
  degraded: boolean;
  providers_attempted: string[];
  total_latency_ms: number;
}

/* ------------------------------------------------------------------ *
 * Storyboard Hook
 * ------------------------------------------------------------------ */

interface StoryboardVariables {
  topic: string;
  scenes: SceneInput[];
  script?: string;
  brand?: string;
  aspect_ratio?: string;
  seed?: number;
}

export function useStoryboardGeneration() {
  const tierInfo = useTierConfig();
  const canGenerate = useAppStore((s) => s.canGenerate);
  const updateGenTime = useAppStore((s) => s.updateGenerationTime);

  return useMutation<StoryboardResponseData, EdgeFunctionError, StoryboardVariables>({
    mutationFn: async (variables) => {
      if (!canGenerate()) await new Promise((r) => setTimeout(r, 400));
      updateGenTime();

      const body = {
        ...variables,
        tier: tierInfo.rawTier,
        // Default brand to first allowed if user picks a restricted one
        brand: variables.brand && tierInfo.allowedBrands.includes(variables.brand)
          ? variables.brand
          : tierInfo.allowedBrands[0] || "Tube.Flash",
      };

      // Route to the Phase 4 Vercel Edge endpoint
      const data = unwrapV1(
        await fetchEdgeFunctionJson<V1Envelope<StoryboardResponseData>>("v1/storyboard", body)
      );
      if (!data) throw new EdgeFunctionError("Empty response from server", 500);

      // Surface upgrade messages / truncation warnings
      if (data.truncated && data.upgrade_message) {
        toast.warning(data.upgrade_message);
      }

      return data;
    },
  });
}

/* ------------------------------------------------------------------ *
 * Thumbnail Hook
 * ------------------------------------------------------------------ */

interface ThumbnailVariables {
  title: string;
  emotion: string;
  style: string;
  aspect_ratio?: string;
  count?: number;
  brand?: string;
  seed?: number;
}

export function useThumbnailGenerationV1() {
  const tierInfo = useTierConfig();
  const canGenerate = useAppStore((s) => s.canGenerate);
  const updateGenTime = useAppStore((s) => s.updateGenerationTime);

  return useMutation<ThumbnailResponseData, EdgeFunctionError, ThumbnailVariables>({
    mutationFn: async (variables) => {
      if (!canGenerate()) await new Promise((r) => setTimeout(r, 400));
      updateGenTime();

      const body = {
        ...variables,
        tier: tierInfo.rawTier,
        brand: variables.brand && tierInfo.allowedBrands.includes(variables.brand)
          ? variables.brand
          : tierInfo.allowedBrands[0] || "Tube.Flash",
        count: tierInfo.clampValue(variables.count ?? 4, "maxThumbnailsPerGeneration"),
      };

      const data = unwrapV1(
        await fetchEdgeFunctionJson<V1Envelope<ThumbnailResponseData>>("v1/thumbnail", body)
      );
      if (!data) throw new EdgeFunctionError("Empty response from server", 500);

      if (data.truncated && data.upgrade_message) {
        toast.warning(data.upgrade_message);
      }

      return data;
    },
  });
}

/* ------------------------------------------------------------------ *
 * QK additions for the Phase 4 endpoints
 * ------------------------------------------------------------------ */

/**
 * Additional query keys for Phase 4 endpoints.
 * These supplement the existing QK from queryKeys.ts.
 */
export const QK_V1 = {
  storyboard: (topic: string, sceneCount: number, tier: string) =>
    ["v1", "storyboard", topic, sceneCount, tier] as const,
  thumbnail: (title: string, emotion: string, style: string, ratio: string, count: number, tier: string, brand?: string) =>
    ["v1", "thumbnail", title, emotion, style, ratio, count, tier, brand] as const,
};
