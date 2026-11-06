/**
 * Minimal typings for the kokoro-js browser package (it ships without
 * complete TypeScript declarations for the parts we use). The engine
 * wrapper in src/lib/p2p/kokoroEngine.ts is the only consumer.
 */
declare module "kokoro-js" {
  export interface KokoroGenerateResult {
    audio: Float32Array;
    sampling_rate: number;
  }
  export class KokoroTTS {
    static from_pretrained(
      modelId: string,
      options?: { dtype?: string; device?: string },
    ): Promise<KokoroTTS>;
    generate(
      text: string,
      options?: { voice?: string; speed?: number },
    ): Promise<KokoroGenerateResult>;
    voices: Record<string, unknown>;
  }
}
