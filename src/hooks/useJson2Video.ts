import { useCallback, useState } from "react";
import { toast } from "sonner";
import { buildPayloadFromAppState, type Json2VideoInternalRequest, type Json2VideoApiPayload } from "@/api/server/json2VideoPayload";
import { fetchEdgeFunctionJson } from "@/api/client/secureClient";
import { useContentStore } from "@/stores/useContentStore";

/**
 * Phase D2 — JSON2Video Assembly Pipeline Hook
 * Builds payload from storyboard + voiceover + topic, exports JSON for download or forwards to secure /api/json2video
 */

interface UseJson2VideoOptions {
  onSuccess?: (payload: { internal: Json2VideoInternalRequest; api: Json2VideoApiPayload }) => void;
}

export function useJson2Video(options?: UseJson2VideoOptions) {
  const [isBuilding, setIsBuilding] = useState(false);
  const [lastPayload, setLastPayload] = useState<{ internal: Json2VideoInternalRequest; api: Json2VideoApiPayload } | null>(null);

  const buildPayload = useCallback((params: {
    storyboardScenes: Array<{ imageUrl?: string; visual_prompt: string; motion_prompt?: string; scene_number: number; beat_type: string }>;
    voiceoverText: string;
    voiceoverAudioUrl?: string;
    topic: string;
    aspectRatio: "9:16" | "16:9";
    tier?: "free" | "pro" | "enterprise";
    voiceId?: string;
  }) => {
    setIsBuilding(true);
    try {
      const payload = buildPayloadFromAppState({
        ...params,
        tier: params.tier || "pro",
      });
      setLastPayload(payload);
      options?.onSuccess?.(payload);
      return payload;
    } catch (e: any) {
      toast.error(e.message || "Failed to build JSON2Video payload");
      return null;
    } finally {
      setIsBuilding(false);
    }
  }, [options]);

  const downloadJson = useCallback((payload: { internal: Json2VideoInternalRequest; api: Json2VideoApiPayload }, type: "internal" | "api" = "api") => {
    const data = type === "api" ? payload.api : payload.internal;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `json2video-${type}-${payload.internal.meta.projectId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${type === "api" ? "JSON2Video API" : "Internal"} payload downloaded! Ready for render.`);

    // Save to Zustand for Dashboard recent
    useContentStore.getState().saveContent({
      type: "storyboard",
      title: `JSON2Video Payload ${type} - ${payload.internal.meta.topic.slice(0, 30)}`,
      content: JSON.stringify(data).slice(0, 5000),
      metadata: { platform: "json2video", style: payload.internal.meta.aspectRatio },
    });
  }, []);

  const sendToJson2Video = useCallback(async (payload: { api: Json2VideoApiPayload }) => {
    setIsBuilding(true);
    try {
      // Secure route: /api/json2video — server forwards with JSON2VIDEO_API_KEY (never client)
      const result = await fetchEdgeFunctionJson<{ success: boolean; project: string; pollUrl: string; message: string }>("json2video", {
        api: payload.api,
      }).catch(async () => {
        // Fallback to direct Vercel /api route if Supabase function not yet deployed
        const res = await fetch("/api/json2video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api: payload.api }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || `API error ${res.status}`);
        }
        return await res.json();
      });

      toast.success(`Render job started! Project: ${result.project}. Poll: ${result.pollUrl || 'Check dashboard'}`);
      return result;
    } catch (e: any) {
      // If no API key set, server returns blueprint — show payload instead
      if (e.message?.includes("blueprint") || e.message?.includes("not configured")) {
        toast.info("JSON2VIDEO_API_KEY not set — payload ready for testing, download JSON to inspect");
        return { blueprint: true, payload: payload.api };
      }
      toast.error(e.message || "Failed to send to JSON2Video");
      return null;
    } finally {
      setIsBuilding(false);
    }
  }, []);

  return { isBuilding, lastPayload, buildPayload, downloadJson, sendToJson2Video };
}
