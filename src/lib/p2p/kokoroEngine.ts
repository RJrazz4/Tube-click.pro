/**
 * src/lib/p2p/kokoroEngine.ts — the local text-to-speech engine.
 *
 * Kokoro-82M (Apache 2.0) running entirely in the visitor's browser via
 * kokoro-js / ONNX Runtime Web. The model (~115 MB at q8) downloads
 * once and is cached by the browser. English voices only — the browser
 * build of Kokoro has no Hindi voices.
 *
 * This engine is the always-available base of the voice mesh: when no
 * peer is online, generation happens here, on the user's own device.
 */
import { audioBufferToWavBlob } from "@/lib/audio/engine";
import type { KokoroTTS } from "kokoro-js";

export interface TtsEngine {
  generate(text: string, voice: string): Promise<Blob>;
}

export const KOKORO_VOICES: { id: string; name: string }[] = [
  { id: "af_heart", name: "Heart — US Female (warm)" },
  { id: "af_bella", name: "Bella — US Female (friendly)" },
  { id: "af_sarah", name: "Sarah — US Female (natural)" },
  { id: "af_nicole", name: "Nicole — US Female (bright)" },
  { id: "am_adam", name: "Adam — US Male (deep)" },
  { id: "am_michael", name: "Michael — US Male (professional)" },
  { id: "am_eric", name: "Eric — US Male (warm)" },
  { id: "am_liam", name: "Liam — US Male (young)" },
  { id: "bf_emma", name: "Emma — UK Female (refined)" },
  { id: "bf_alice", name: "Alice — UK Female (elegant)" },
  { id: "bm_george", name: "George — UK Male (deep)" },
  { id: "bm_daniel", name: "Daniel — UK Male (assured)" },
];

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let ttsPromise: Promise<KokoroTTS> | null = null;

function loadTts(): Promise<KokoroTTS> {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      const mod = await import("kokoro-js");
      return mod.KokoroTTS.from_pretrained(MODEL_ID, { dtype: "q8", device: "wasm" });
    })();
    // A failed load must not poison later attempts.
    ttsPromise.catch(() => {
      ttsPromise = null;
    });
  }
  return ttsPromise;
}

export const kokoroEngine: TtsEngine & { warmup: () => Promise<void>; isWarm: () => boolean } = {
  async generate(text: string, voice: string): Promise<Blob> {
    const tts = await loadTts();
    const result = await tts.generate(text, { voice });
    const rate = result.sampling_rate || 24000;
    const ctx = new OfflineAudioContext(1, result.audio.length, rate);
    const buffer = ctx.createBuffer(1, result.audio.length, rate);
    buffer.copyToChannel(result.audio, 0);
    return audioBufferToWavBlob(buffer);
  },
  warmup: () => loadTts().then(() => undefined),
  isWarm: () => ttsPromise !== null,
};
