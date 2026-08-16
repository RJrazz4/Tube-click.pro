import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/VoiceStudio.tsx", "utf8");
const client = readFileSync("src/api/client/backendEngineVoice.ts", "utf8");

describe("Voiceover Studio routing contract", () => {
  it("routes Neural Voice generation to the dedicated backend engine", () => {
    expect(source).toContain("generateNeuralVoice({");
    expect(client).toContain("/api/voice/generate");
    expect(client).toContain("Idempotency-Key");
  });

  it("keeps Toggle OFF on the browser speech synthesis path", () => {
    expect(source).toContain("if (!useElevenLabs)");
    expect(source).toContain("window.speechSynthesis.speak(utterance)");
    expect(source).toContain("BROWSER_TTS_MAX_CHARS = 500");
  });

  it("uses static preview MP3s without a generation request", () => {
    expect(source).toContain("const audio = new Audio(voice.preview)");
    expect(source).toContain("/previews/voices/Nova.mp3");
    expect(source).not.toContain('fetchEdgeFunctionBlob("elevenlabs-tts"');
  });
});
