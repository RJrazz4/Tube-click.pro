/**
 * Phase D2 FINAL — JSON2Video Prep: Data payload for Shorts/Reels rendering
 * Creates JSON structure to send generated images + audio to JSON2Video API
 * 
 * This is the assembly pipeline: Visual Storyboard (images) + Voiceover Studio (audio) => JSON2Video => Rendered Shorts/Reels
 * 
 * Secure: JSON2VIDEO_API_KEY is server-only (process.env / Deno.env), never client
 * Endpoint: /api/json2video (Vercel Edge) forwards to https://api.json2video.com/v2/movies
 */

export interface ScenePayload {
  sceneNumber: number;
  imageUrl: string;
  visualPrompt?: string;
  motionPrompt?: string;
  duration: number; // seconds per scene
  transition?: "fade" | "slide" | "zoom" | "none";
  beatType?: string;
}

export interface VoicePayload {
  audioUrl: string; // Blob URL or https URL to MP3 — in production, upload to CDN and pass https URL to JSON2Video
  text: string;
  voiceId: string;
  totalDuration: number;
  // For JSON2Video TTS alternative: if no audioUrl, can use text + voice
  useJson2VideoTTS?: boolean;
}

export interface Json2VideoInternalRequest {
  // Our internal representation — easy for UI
  resolution: "1080x1920" | "1920x1080" | "1280x720";
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
    topic: string;
    tier: "free" | "pro" | "enterprise";
    aspectRatio: "9:16" | "16:9";
    createdAt: string;
  };
}

export interface Json2VideoApiPayload {
  // Actual payload sent to https://api.json2video.com/v2/movies
  // Conforms to JSON2Video API v2 spec: https://json2video.com/docs/
  id?: string;
  comment?: string;
  resolution: string; // "full-hd" for 16:9, "custom" + width/height, or "vertical" pattern
  width?: number;
  height?: number;
  quality?: "high" | "medium";
  draft?: boolean;
  scenes: Array<{
    comment?: string;
    duration?: number;
    elements: Array<{
      type: "image" | "video" | "audio" | "text" | "voice" | "subtitles";
      src?: string;
      text?: string;
      duration?: number;
      style?: string;
      width?: number;
      height?: number;
      // Image specific
      x?: number;
      y?: number;
      // Audio
      volume?: number;
      // Text / Captions
      "font-family"?: string;
      "font-size"?: number;
      color?: string;
      "background-color"?: string;
      // Voice
      voice?: string;
      model?: string;
    }>;
  }>;
  // Webhook for completion
  exports?: Array<{
    destinations: Array<{
      type: "webhook";
      endpoint: string;
    }>;
  }>;
}

/**
 * Builds internal TubeClick Pro payload from storyboard + voiceover
 */
export function buildJson2VideoInternalPayload(params: {
  scenes: ScenePayload[];
  voiceover: VoicePayload;
  topic: string;
  aspectRatio: "9:16" | "16:9";
  tier: "free" | "pro" | "enterprise";
}): Json2VideoInternalRequest {
  const projectId = `tg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  return {
    resolution: params.aspectRatio === "9:16" ? "1080x1920" : "1920x1080",
    fps: 30,
    backgroundColor: "#000000",
    scenes: params.scenes.map((s, idx) => ({
      ...s,
      duration: s.duration || 3, // default 3s per scene if not specified
      transition: s.transition || (idx === 0 ? "none" : "fade"),
    })),
    voiceover: params.voiceover,
    captions: {
      enabled: true,
      style: "viral",
      language: "en",
    },
    branding: {
      watermark: params.tier === "free" ? "TubeClick Pro" : undefined,
      outro: true,
    },
    meta: {
      projectId,
      topic: params.topic,
      tier: params.tier,
      aspectRatio: params.aspectRatio,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Converts internal TubeClick Pro payload to actual JSON2Video API v2 payload
 * This is what is POSTed to https://api.json2video.com/v2/movies with x-api-key header
 */
export function toJson2VideoApiPayload(
  internal: Json2VideoInternalRequest,
  options?: { webhookUrl?: string; draft?: boolean }
): Json2VideoApiPayload {
  const isVertical = internal.resolution === "1080x1920";
  const totalDuration = internal.scenes.reduce((sum, s) => sum + s.duration, 0);

  // If voiceover audioUrl is blob: (e.g., blob:...) we cannot send to JSON2Video — it needs https URL
  // In production, upload blob to S3/Cloudinary/Vercel Blob and pass https URL
  // For now, we include audio as separate element per scene with duration split

  // Distribute voiceover text roughly? For MVP, use one audio element spanning all scenes
  // JSON2Video supports voice element for TTS, or audio for pre-generated MP3

  const scenes: Json2VideoApiPayload["scenes"] = internal.scenes.map((scene, idx) => {
    const elements: Json2VideoApiPayload["scenes"][0]["elements"] = [
      {
        type: "image",
        src: scene.imageUrl,
        duration: scene.duration,
        width: isVertical ? 1080 : 1920,
        height: isVertical ? 1920 : 1080,
        x: 0,
        y: 0,
      },
    ];

    // Add motion/caption text as overlay (beat type)
    if (scene.beatType) {
      elements.push({
        type: "text",
        text: scene.beatType,
        duration: 1.5,
        style: "bold",
        "font-family": "Montserrat",
        "font-size": 48,
        color: "#FFFFFF",
        "background-color": "rgba(0,0,0,0.5)",
        x: 50,
        y: isVertical ? 1600 : 900,
      });
    }

    return {
      comment: `Scene ${scene.sceneNumber} - ${scene.beatType || 'Beat'} (${scene.duration}s)`,
      duration: scene.duration,
      elements,
    };
  });

  // Add voiceover as audio or voice element in first scene (or as global audio track)
  // JSON2Video v2: audio elements can be added to scenes with volume
  if (internal.voiceover.audioUrl && !internal.voiceover.audioUrl.startsWith('blob:')) {
    // If https URL, add as audio element spanning
    scenes[0].elements.push({
      type: "audio",
      src: internal.voiceover.audioUrl,
      duration: totalDuration,
      volume: 1,
    });
  } else if (internal.voiceover.text) {
    // Fallback: use JSON2Video TTS voice element (if no audio URL)
    scenes[0].elements.push({
      type: "voice",
      text: internal.voiceover.text.slice(0, 2000), // limit for API
      duration: totalDuration,
      voice: internal.voiceover.voiceId || "en-US-AriaNeural",
      model: "elevenlabs",
    } as any);
  }

  // Add captions/subtitles if enabled
  if (internal.captions.enabled) {
    scenes.forEach((scene) => {
      scene.elements.push({
        type: "subtitles",
        text: internal.voiceover.text.slice(0, 200), // simplified — real would be SRT per scene
        duration: scene.duration,
        style: internal.captions.style === "viral" ? "tiktok" : "classic",
        "font-family": "Inter",
        "font-size": isVertical ? 36 : 32,
        color: "#FFFFFF",
      } as any);
    });
  }

  const payload: Json2VideoApiPayload = {
    id: internal.meta.projectId,
    comment: `TubeGenius Pro - ${internal.meta.topic} - ${internal.scenes.length} scenes - ${internal.meta.aspectRatio} - Tier: ${internal.meta.tier}`,
    resolution: isVertical ? "custom" : "full-hd",
    width: isVertical ? 1080 : 1920,
    height: isVertical ? 1920 : 1080,
    quality: internal.meta.tier === "free" ? "medium" : "high",
    draft: options?.draft ?? true, // Draft true for testing — set false for final render
    scenes,
  };

  // Webhook for completion — notify user via email / dashboard
  if (options?.webhookUrl) {
    payload.exports = [
      {
        destinations: [
          {
            type: "webhook",
            endpoint: options.webhookUrl,
          },
        ],
      },
    ];
  }

  return payload;
}

/**
 * Helper to build payload directly from Storyboard + Voiceover state
 */
export function buildPayloadFromAppState(params: {
  storyboardScenes: Array<{ imageUrl?: string; visual_prompt: string; motion_prompt?: string; scene_number: number; beat_type: string }>;
  voiceoverText: string;
  voiceoverAudioUrl?: string; // blob or https
  topic: string;
  aspectRatio: "9:16" | "16:9";
  tier: "free" | "pro" | "enterprise";
  voiceId?: string;
}): { internal: Json2VideoInternalRequest; api: Json2VideoApiPayload } {
  const scenePayloads: ScenePayload[] = params.storyboardScenes
    .filter((s) => s.imageUrl)
    .map((s, idx) => ({
      sceneNumber: s.scene_number,
      imageUrl: s.imageUrl!,
      visualPrompt: s.visual_prompt,
      motionPrompt: s.motion_prompt,
      duration: 3, // 3s per scene default — can be dynamic based on script length
      transition: idx === 0 ? "none" : "fade",
      beatType: s.beat_type,
    }));

  const totalDuration = scenePayloads.reduce((sum, s) => sum + s.duration, 0);

  const voicePayload: VoicePayload = {
    audioUrl: params.voiceoverAudioUrl || "",
    text: params.voiceoverText,
    voiceId: params.voiceId || "Atlas",
    totalDuration,
  };

  const internal = buildJson2VideoInternalPayload({
    scenes: scenePayloads,
    voiceover: voicePayload,
    topic: params.topic,
    aspectRatio: params.aspectRatio,
    tier: params.tier,
  });

  const api = toJson2VideoApiPayload(internal, {
    webhookUrl: undefined, // Set to your webhook endpoint like https://tubeclickpro.in/api/webhook/json2video
    draft: true,
  });

  return { internal, api };
}

export const JSON2VIDEO_BLUEPRINT = `
Phase D2 — JSON2Video Assembly Pipeline:

1. User creates storyboard (4-10 images) via Tube.Flash/Pro/Cinematic + voiceover via VectorEngine
2. Frontend calls buildPayloadFromAppState({ storyboardScenes, voiceoverText, voiceoverAudioUrl, topic, aspectRatio, tier })
3. Returns { internal, api } where api is ready for POST https://api.json2video.com/v2/movies
4. Server route /api/json2video (Vercel Edge) does:
   POST https://api.json2video.com/v2/movies
   Headers: x-api-key: process.env.JSON2VIDEO_API_KEY (server only), Content-Type: application/json
   Body: api payload
   Returns: { project: "tg-..." }
5. Poll status: GET https://api.json2video.com/v2/movies?project=tg-...
6. Webhook: When render completes, JSON2Video POSTs to your endpoint with { url: "https://assets.json2video.com/...mp4", duration, size }
7. Webhook handler saves MP4 to dashboard + notifies user via email

Security:
- JSON2VIDEO_API_KEY never in frontend — only in process.env / Deno.env on server
- Frontend only generates internal payload, server converts to api payload and forwards
- Free tier gets watermark, pro tier no watermark, enterprise priority queue
`;

// Example payload for documentation / testing
export const EXAMPLE_PAYLOAD: Json2VideoApiPayload = {
  id: "tg-example-123",
  comment: "TubeClick Pro - Example Shorts - 5 scenes - 9:16 - Tier: pro",
  resolution: "custom",
  width: 1080,
  height: 1920,
  quality: "high",
  draft: true,
  scenes: [
    {
      comment: "Scene 1 - Opening Hook",
      duration: 3,
      elements: [
        { type: "image", src: "https://example.com/scene1.png", duration: 3, width: 1080, height: 1920 },
        { type: "text", text: "Opening Hook", duration: 1.5, style: "bold" },
        { type: "audio", src: "https://example.com/voiceover.mp3", duration: 15, volume: 1 },
      ],
    },
  ],
};
