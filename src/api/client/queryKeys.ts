/**
 * Centralized React Query keys.
 *
 * A single source of truth for the query-key namespace, making cache
 * invalidation predictable across the app.
 */
export const QK = {
  // LLM-backed content generation
  generateContent: (topic: string, platform: string, style: string, lang: string) =>
    ["content", "generate", topic, platform, style, lang] as const,
  seo: (keyword: string, platform: string, lang: string) =>
    ["seo", keyword, platform, lang] as const,
  // Phase C — Visual Engine
  thumbnail: (title: string, emotion: string, style: string, ratio: string, brand?: string) =>
    ["thumb", title, emotion, style, ratio, brand] as const,
  storyboardAnalyze: (hash: string) => ["storyboard", "analyze", hash] as const,
  storyboardImage: (prompt: string) => ["storyboard", "image", prompt] as const,
  visionGuide: (count: number) => ["vision", "guide", count] as const,
  // Phase D — Voice + Transcript
  voice: (textHash: string, voiceId: string) => ["voice", textHash, voiceId] as const,
  transcript: (url: string) => ["transcript", url] as const,
};
