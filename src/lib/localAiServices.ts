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

const MIGRATION_PENDING_MESSAGE =
  "Local AI service migration is pending. Provide the required API keys in the dependency setup loop before using this feature.";

function raiseMigrationPending(): never {
  throw new Error(MIGRATION_PENDING_MESSAGE);
}

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

export async function generateElevenLabsSpeech(_request: {
  text: string;
  voiceId: string;
  stability: number;
  similarityBoost: number;
  speed: number;
}): Promise<Blob> {
  return raiseMigrationPending();
}
