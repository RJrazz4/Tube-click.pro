import { supabase } from "@/integrations/supabase/client";

export interface NeuralVoiceRequest {
  text: string;
  voiceAlias: string;
  stability: number;
  speed: number;
  outputFormat: "mp3";
}

import { normalizeBaseUrl } from "@/lib/engine/url";

// Accept either alias so the engine is reachable whichever one is set in Vercel.
// normalizeBaseUrl also strips stray whitespace/quotes baked into env values.
const BACKEND_ENGINE_URL = normalizeBaseUrl(
  String(
    import.meta.env.VITE_BACKEND_ENGINE_URL ||
      import.meta.env.VITE_ENGINE_URL ||
      "",
  ),
);

function requestId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export async function generateNeuralVoice(
  request: NeuralVoiceRequest,
): Promise<Blob> {
  if (!BACKEND_ENGINE_URL) {
    throw new Error("TubeClick backend engine URL is not configured");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Please sign in before generating a neural voiceover");
  }

  // Provider fallback and retry happen server-side. The browser deliberately
  // sends one request so a network retry cannot generate or bill twice.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(`${BACKEND_ENGINE_URL}/api/voice/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "X-Request-Id": requestId(),
        "Idempotency-Key": requestId(),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        body?.error?.message ||
        body?.message ||
        `Voice generation failed (${response.status})`;
      throw new Error(message);
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      !contentType.includes("audio/") &&
      !contentType.includes("application/octet-stream")
    ) {
      throw new Error("Voice engine returned an invalid audio response");
    }

    return await response.blob();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Neural voice generation timed out");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
