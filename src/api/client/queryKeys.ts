/**
 * Centralized React Query keys for optimal caching — Phase A2 prep
 */
export const QK = {
  generateContent: (topic: string, platform: string, style: string, lang: string) =>
    ["content", "generate", topic, platform, style, lang] as const,
  thumbnail: (title: string, emotion: string, style: string, ratio: string) =>
    ["thumb", title, emotion, style, ratio] as const,
  storyboardAnalyze: (hash: string) => ["storyboard", "analyze", hash] as const,
  storyboardImage: (prompt: string) => ["storyboard", "image", prompt] as const,
  visionGuide: (count: number) => ["vision", "guide", count] as const,
  voice: (textHash: string, voiceId: string) => ["voice", textHash, voiceId] as const,
  transcript: (url: string) => ["transcript", url] as const,
  seo: (topic: string) => ["seo", topic] as const,
};
