/**
 * Vercel — /api/transcript — Phase B2 Free Value Add
 * REAL implementation using free node package: youtube-transcript
 * No API key — extracts transcript from YouTube URL server-side only
 * Runtime: nodejs (not edge) because youtube-transcript uses Node APIs
 * Powers Multi-Platform Repurposer: URL -> Transcript -> Repurposed assets via Gemini
 */
export const config = {
  runtime: 'nodejs', // Must be nodejs for youtube-transcript lib
};

import { jsonResponse, corsHeaders, safeJsonBody } from './_shared.js';

// NOTE: youtube-transcript is installed via npm — see package.json
// For Vercel Node runtime, we can import it directly
// Using dynamic import to handle both ESM and CJS interop
let YoutubeTranscriptLib: any = null;

async function getTranscriptLib() {
  if (YoutubeTranscriptLib) return YoutubeTranscriptLib;
  try {
    // Try ESM import
    const mod = await import('youtube-transcript');
    // CJS interop fallback: the ESM build has no `default` export, hence the cast
    YoutubeTranscriptLib = mod.YoutubeTranscript || (mod as any).default || mod;
    return YoutubeTranscriptLib;
  } catch (e) {
    console.error('Failed to load youtube-transcript lib', e);
    throw new Error('Transcript library not available on server — install youtube-transcript');
  }
}

function extractId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\?\/\s]{11})/,
    /^([^&\?\/\s]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  // Try URL parsing
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    if (v && v.length === 11) return v;
  } catch {}
  return null;
}

// Fallback: try to fetch via Piped/Innertube free API if youtube-transcript fails
async function fetchViaPiped(videoId: string): Promise<{ text: string; segments: any[] } | null> {
  // Try Piped API free instance — no key
  const pipedInstances = [
    `https://pipedapi.kavin.rocks/transcripts/${videoId}`,
    `https://api.piped.private.coffee/transcripts/${videoId}`,
  ];

  for (const apiUrl of pipedInstances) {
    try {
      const res = await fetch(apiUrl, { headers: { 'User-Agent': 'TubeClickPro/2.0' } });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const fullText = data.map((t: any) => t.text || '').join(' ');
        if (fullText.trim().length > 20) {
          return { text: fullText, segments: data };
        }
      }
    } catch {}
  }
  return null;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const bodyResult = await safeJsonBody(req);
    if (bodyResult.error) return jsonResponse({ error: bodyResult.error }, 400);
    const { url, lang = 'en' } = bodyResult.data;

    if (!url || typeof url !== 'string') return jsonResponse({ error: 'YouTube URL required. Example: https://youtube.com/watch?v=dQw4w9WgXcQ' }, 400);

    const videoId = extractId(url.trim());
    if (!videoId) return jsonResponse({ error: 'Invalid YouTube URL. Could not extract video ID. Supported: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/' }, 400);

    // Attempt 1: youtube-transcript lib (free, no API key)
    try {
      const lib = await getTranscriptLib();
      // lib.fetchTranscript(videoId, { lang })
      const transcriptSegments = await lib.fetchTranscript(videoId, { lang }).catch(async () => {
        // Retry without lang (auto)
        return await lib.fetchTranscript(videoId);
      });

      if (Array.isArray(transcriptSegments) && transcriptSegments.length > 0) {
        const fullText = transcriptSegments.map((t: any) => t.text).join(' ');
        if (fullText.trim().length > 10) {
          return jsonResponse({
            videoId,
            transcript: fullText,
            segments: transcriptSegments,
            source: 'youtube-transcript',
            length: fullText.length,
            wordCount: fullText.split(/\s+/).filter(Boolean).length,
          });
        }
      }
    } catch (err: any) {
      console.warn('youtube-transcript failed, trying fallback', err?.message);
      // Continue to fallback
    }

    // Attempt 2: Piped free API fallback
    try {
      const pipedResult = await fetchViaPiped(videoId);
      if (pipedResult) {
        return jsonResponse({
          videoId,
          transcript: pipedResult.text,
          segments: pipedResult.segments,
          source: 'piped-fallback',
          length: pipedResult.text.length,
          wordCount: pipedResult.text.split(/\s+/).filter(Boolean).length,
        });
      }
    } catch {}

    // Attempt 3: Provide clear error with instructions
    return jsonResponse({
      error: 'Transcript not available for this video. Video may have captions disabled, or be private.',
      videoId,
      action: 'Try another video with captions enabled, or paste transcript manually into Repurposer.',
      fallback: 'You can still use Multi-Platform Repurposer by pasting title/script manually — transcript extraction is optional free value add.',
    }, 404);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[transcript] error:', msg);
    return jsonResponse({ error: msg || 'Failed to extract transcript', action: 'Check URL and try again', service: 'transcript' }, 500);
  }
}
