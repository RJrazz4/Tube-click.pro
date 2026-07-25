import { useState, useRef, useCallback } from "react";

/**
 * Voice-preview hook.
 *
 * Plays short static MP3 samples from `public/previews/voices/` for
 * instant preview feedback without consuming TTS quota. The full
 * generation call is only made when the user explicitly requests it.
 */

export function useVoicePreview() {
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playPreview = useCallback(async (voiceName: string, previewUrl: string) => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      if (isPreviewPlaying === voiceName) {
        setIsPreviewPlaying(null);
        return;
      }

      const audio = new Audio(previewUrl);
      audio.volume = 0.8;
      audioRef.current = audio;
      setIsPreviewPlaying(voiceName);

      audio.onended = () => setIsPreviewPlaying(null);
      audio.onerror = () => {
        console.warn(`Preview MP3 missing for ${voiceName}: ${previewUrl}`);
        setIsPreviewPlaying(null);
      };

      await audio.play();
    } catch {
      setIsPreviewPlaying(null);
    }
  }, [isPreviewPlaying]);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPreviewPlaying(null);
  }, []);

  return { isPreviewPlaying, playPreview, stopPreview };
}
