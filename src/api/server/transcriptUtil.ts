/**
 * Phase B2 Blueprint — Free Value Add: URL to Transcript
 * Utilizes free node packages to extract YouTube transcript server-side.
 * 
 * Libraries to use (free, no API key):
 * - youtube-transcript (npm)
 * - ytdl-core (fallback) or innertube
 * 
 * This util lives server-side only — never in frontend bundle.
 * Endpoint: /api/transcript -> { youtubeUrl } -> { transcript }
 */

export const TRANSCRIPT_BLUEPRINT = `
// server route: app/api/transcript/route.ts  (Vercel Edge / Supabase Edge)
import { YoutubeTranscript } from 'youtube-transcript';

export async function POST(req) {
  const { url } = await req.json();
  const videoId = extractVideoId(url);
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  const fullText = transcript.map(t => t.text).join(' ');
  return { transcript: fullText, segments: transcript };
}

function extractVideoId(url: string): string {
  const regex = /(?:youtube\\.com\\/(?:[^/]+\\/.+\\/|(?:v|e(?:mbed)?)\\/|.*[?&]v=)|youtu\\.be\\/)([^"&?/\\s]{11})/;
  return url.match(regex)?.[1] || url;
}
`;

export function extractYouTubeId(url: string): string | null {
  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/\s]{11})/,
      /^([^&\?\/\s]{11})$/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}
