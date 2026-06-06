export interface GeneratedContentResponse {
  titles: string[];
  hooks: string[];
  script: string;
  hashtags: string[];
  description: string;
}

export interface GenerateContentRequest {
  topic: string;
  platform: string;
  style: string;
  language: string;
}

export interface GenerateThumbnailRequest {
  title: string;
  emotion: string;
  style: string;
  aspectRatio: "16:9" | "9:16";
  count: number;
}

export interface GenerateThumbnailResponse {
  thumbnails: (string | null)[];
}

export interface AnalyzeStoryboardResponse {
  scenes: unknown[];
}

export interface GenerateStoryboardImageResponse {
  imageUrl: string;
}

interface PuterAiOptions {
  provider?: string;
  voice?: string;
  engine?: string;
  model?: string;
  output_format?: string;
  removeBackgroundNoise?: boolean;
  audio?: string | File | Blob;
}

interface PuterAi {
  txt2speech?: (text: string, options?: PuterAiOptions | boolean, testMode?: boolean) => Promise<HTMLAudioElement>;
  tts2speech?: (text: string, options?: PuterAiOptions | boolean, testMode?: boolean) => Promise<HTMLAudioElement>;
  speech2speech?: (
    source: string | File | Blob | PuterAiOptions,
    options?: PuterAiOptions | boolean,
    testMode?: boolean
  ) => Promise<HTMLAudioElement>;
}

interface PuterGlobal {
  ai?: PuterAi;
}

declare global {
  interface Window {
    puter?: PuterGlobal;
  }
}

export interface VoiceServiceState {
  isLoading: boolean;
  currentAudio: HTMLAudioElement | null;
  error: string | null;
}

export interface VoiceServiceContract {
  readonly state: VoiceServiceState;
  textToSpeech(text: string, voiceId?: string): Promise<HTMLAudioElement>;
  convertVoice(audioFile: File, targetVoiceId: string): Promise<HTMLAudioElement>;
  play(audio: HTMLAudioElement): Promise<void>;
  stop(): void;
}

const PUTER_SCRIPT_SRC = "https://js.puter.com/v2/";
const MIGRATION_PENDING_MESSAGE =
  "Local AI service migration is pending. Provide the required API keys in the dependency setup loop before using this feature.";

let puterScriptPromise: Promise<void> | null = null;

function raiseMigrationPending(): never {
  throw new Error(MIGRATION_PENDING_MESSAGE);
}

function normalizePuterAudio(audio: HTMLAudioElement): HTMLAudioElement {
  const audioUrl = audio.src || audio.currentSrc || audio.toString();

  if (!audioUrl) {
    throw new Error("Puter did not return a playable audio source.");
  }

  if (!audio.src) {
    audio.src = audioUrl;
  }

  audio.controls = true;
  return audio;
}

async function ensurePuter(): Promise<PuterGlobal> {
  if (typeof window === "undefined") {
    throw new Error("Puter voice services can only run in a browser.");
  }

  if (window.puter?.ai) {
    return window.puter;
  }

  puterScriptPromise ??= new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${PUTER_SCRIPT_SRC}"]`);

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Puter.js.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = PUTER_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Puter.js."));
    document.head.appendChild(script);
  });

  await puterScriptPromise;

  if (!window.puter?.ai) {
    throw new Error("Puter.js loaded, but AI voice APIs are unavailable.");
  }

  return window.puter;
}

export class VoiceService implements VoiceServiceContract {
  private serviceState: VoiceServiceState = {
    isLoading: false,
    currentAudio: null,
    error: null,
  };

  get state(): VoiceServiceState {
    return this.serviceState;
  }

  async textToSpeech(text: string, voiceId = "standard"): Promise<HTMLAudioElement> {
    const trimmedText = text.trim();

    if (!trimmedText) {
      throw new Error("Please enter text before generating speech.");
    }

    if (trimmedText.length > 3000) {
      throw new Error("Puter text-to-speech supports up to 3000 characters per request.");
    }

    this.setLoading();

    try {
      const puter = await ensurePuter();
      const speechMethod = puter.ai?.tts2speech ?? puter.ai?.txt2speech;

      if (!speechMethod) {
        throw new Error("Puter text-to-speech API is unavailable.");
      }

      const options = voiceId === "standard" ? { provider: "aws-polly" } : { provider: "aws-polly", voice: voiceId };
      const audio = normalizePuterAudio(await speechMethod(trimmedText, options));
      await this.play(audio);
      return audio;
    } catch (error) {
      this.captureError(error, "Unable to generate speech with Puter.js.");
      throw error;
    } finally {
      this.serviceState.isLoading = false;
    }
  }

  async convertVoice(audioFile: File, targetVoiceId: string): Promise<HTMLAudioElement> {
    if (!audioFile) {
      throw new Error("Please upload an audio file before converting voice.");
    }

    if (!audioFile.type.startsWith("audio/")) {
      throw new Error("Please upload a valid audio file.");
    }

    this.setLoading();

    try {
      const puter = await ensurePuter();

      if (!puter.ai?.speech2speech) {
        throw new Error("Puter voice conversion API is unavailable.");
      }

      const audio = normalizePuterAudio(await puter.ai.speech2speech(audioFile, {
        voice: targetVoiceId,
        model: "eleven_multilingual_sts_v2",
        output_format: "mp3_44100_128",
        removeBackgroundNoise: true,
      }));
      await this.play(audio);
      return audio;
    } catch (error) {
      this.captureError(error, "Unable to convert voice with Puter.js.");
      throw error;
    } finally {
      this.serviceState.isLoading = false;
    }
  }

  async play(audio: HTMLAudioElement): Promise<void> {
    this.stop();
    this.serviceState.currentAudio = audio;
    audio.currentTime = 0;
    await audio.play();
  }

  stop(): void {
    if (this.serviceState.currentAudio) {
      this.serviceState.currentAudio.pause();
      this.serviceState.currentAudio.currentTime = 0;
    }
  }

  private setLoading(): void {
    this.stop();
    this.serviceState = {
      isLoading: true,
      currentAudio: null,
      error: null,
    };
  }

  private captureError(error: unknown, fallback: string): void {
    this.serviceState.error = error instanceof Error ? error.message : fallback;
  }
}

export const voiceService = new VoiceService();

export async function generateContent(_request: GenerateContentRequest): Promise<GeneratedContentResponse> {
  return raiseMigrationPending();
}

export async function generateThumbnails(_request: GenerateThumbnailRequest): Promise<GenerateThumbnailResponse> {
  return raiseMigrationPending();
}

export async function generateVisionGuide(_images: string[]): Promise<string> {
  return raiseMigrationPending();
}

export async function analyzeStoryboard(_script: string): Promise<AnalyzeStoryboardResponse> {
  return raiseMigrationPending();
}

export async function generateStoryboardImage(
  _prompt: string,
  _sceneNumber: number,
  _signal?: AbortSignal
): Promise<GenerateStoryboardImageResponse> {
  return raiseMigrationPending();
}
