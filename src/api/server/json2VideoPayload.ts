/**
 * Phase D2 Blueprint — JSON2Video Prep: Data payload for Shorts/Reels rendering
 * Creates JSON structure to send generated images + audio to JSON2Video API
 */

export interface ScenePayload {
  sceneNumber: number;
  imageUrl: string;
  motionPrompt?: string;
  duration: number; // seconds
  transition?: "fade" | "slide" | "zoom";
}

export interface VoicePayload {
  audioUrl: string;
  text: string;
  voiceId: string;
  totalDuration: number;
}

export interface Json2VideoRequest {
  resolution: "1080x1920" | "1920x1080" | "1280x720"; // 9:16 for Shorts/Reels, 16:9 for YT
  fps: number;
  backgroundColor: string;
  scenes: ScenePayload[];
  voiceover: VoicePayload;
  captions: {
    enabled: boolean;
    style: "tubeGenius" | "viral" | "minimal";
    language: string;
  };
  branding: {
    watermark?: string;
    outro: boolean;
  };
  meta: {
    projectId: string;
    tier: "free" | "pro";
  };
}

export function buildJson2VideoPayload(params: {
  scenes: ScenePayload[];
  voiceover: VoicePayload;
  topic: string;
  aspectRatio: "9:16" | "16:9";
  tier: "free" | "pro";
}): Json2VideoRequest {
  return {
    resolution: params.aspectRatio === "9:16" ? "1080x1920" : "1920x1080",
    fps: 30,
    backgroundColor: "#000000",
    scenes: params.scenes,
    voiceover: params.voiceover,
    captions: {
      enabled: true,
      style: "viral",
      language: "en",
    },
    branding: {
      watermark: params.tier === "free" ? "TubeGenius Pro" : undefined,
      outro: true,
    },
    meta: {
      projectId: `tg-${Date.now()}`,
      tier: params.tier,
    },
  };
}

export const JSON2VIDEO_BLUEPRINT = `
POST https://api.json2video.com/v2/movies
Headers: x-api-key: process.env.JSON2VIDEO_API_KEY (server only)
Body: Json2VideoRequest above

Future: Add webhook callback for render complete -> notify user via email / dashboard
`;
