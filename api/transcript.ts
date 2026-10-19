/**
 * Vercel Edge Function — POST /api/transcript
 *
 * YouTube transcript extraction optimized for Vercel Edge runtime (zero cold starts,
 * no Node.js dependency hangs, instant global POP response).
 *
 * Fallback cascade:
 *   1. Direct YouTube watch page caption track fetch (Edge-compatible).
 *   2. Piped public API relay mesh.
 *   3. Invidious relay mesh.
 *
 * HONESTY RULE: if no real caption source yields a transcript, the route
 * returns { transcript: null, noCaptions: true } — NEVER a fabricated
 * transcript. Callers must surface that state to the user instead of
 * presenting synthetic text as real.
 */
export const runtime = 'edge';
export const config = { runtime: 'edge', maxDuration: 60 };

import { jsonResponse, corsHeaders, safeJsonBody } from './_shared.js';

function extractId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\?\/\s]{11})/,
    /^([^&\?\/\s]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    if (v && v.length === 11) return v;
  } catch { /* noop */ }
  return null;
}

type TranscriptResult = { text: string; segments: any[]; source: string; ghostNode: string; timedOut?: boolean };

async function firstValid<T>(promises: Array<Promise<T | null>>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = 0;
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);

    promises.forEach((promise) => {
      promise.then((value) => {
        if (!done && value) {
          done = true;
          clearTimeout(timer);
          resolve(value);
        }
      }).catch(() => {}).finally(() => {
        settled++;
        if (!done && settled === promises.length) {
          done = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
    });
  });
}

function normalizeSegments(segments: any[]): { text: string; segments: any[] } | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const text = segments.map((t: any) => t?.text || t?.snippet || '').join(' ').replace(/\s+/g, ' ').trim();
  if (text.length < 30) return null;
  return { text, segments };
}

function cleanCaptionText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/WEBVTT/gi, ' ')
    .replace(/Kind:\s*captions/gi, ' ')
    .replace(/Language:\s*[^\n]+/gi, ' ')
    .replace(/\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}[^\n]*/g, ' ')
    .replace(/\d{1,2}:\d{2}[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}[.,]\d{3}[^\n]*/g, ' ')
    .replace(/^\d+$/gm, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const PIPED_TRANSCRIPT_NODES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.private.coffee',
  'https://pipedapi.colby.rocks',
  'https://pipedapi.mha.fi',
];

const INVIDIOUS_NODES = [
  'https://yewtu.be',
  'https://invidious.io',
  'https://vid.puffyan.us',
];

async function fetchViaYoutubeDirect(videoId: string, lang: string): Promise<TranscriptResult | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': `${lang},en;q=0.9`,
      },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"captionTracks":\s*(\[.+?\])/);
    if (!match) return null;
    const tracks = JSON.parse(match[1]);
    const track = tracks.find((t: any) => t.languageCode?.startsWith(lang)) || tracks[0];
    if (!track?.baseUrl) return null;
    const capRes = await fetch(track.baseUrl, { signal: AbortSignal.timeout(2500) });
    if (!capRes.ok) return null;
    const xml = await capRes.text();
    const cleaned = cleanCaptionText(xml);
    if (cleaned.length < 30) return null;
    return { text: cleaned, segments: [{ text: cleaned, duration: 120, offset: 0 }], source: 'youtube-direct-edge', ghostNode: 'YT-Direct' };
  } catch {
    return null;
  }
}

async function fetchPipedNode(base: string, videoId: string): Promise<TranscriptResult | null> {
  try {
    const res = await fetch(`${base}/transcripts/${videoId}`, {
      headers: { 'User-Agent': 'TubeClickPro/2.0 Edge' },
      signal: AbortSignal.timeout(1800),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const normalized = normalizeSegments(Array.isArray(data) ? data : (data?.transcripts || data?.captions || []));
    if (!normalized) return null;
    return { ...normalized, source: 'piped-ghost-relay', ghostNode: base.replace(/^https?:\/\//, '').split('.')[0].toUpperCase() };
  } catch {
    return null;
  }
}

async function fetchViaPiped(videoId: string): Promise<TranscriptResult | null> {
  return firstValid(PIPED_TRANSCRIPT_NODES.map((base) => fetchPipedNode(base, videoId)), 2200);
}

async function fetchInvidiousNode(base: string, videoId: string): Promise<TranscriptResult | null> {
  try {
    const listRes = await fetch(`${base}/api/v1/captions/${videoId}`, {
      headers: { 'User-Agent': 'TubeClickPro/2.0 Edge' },
      signal: AbortSignal.timeout(1800),
    });
    if (!listRes.ok) return null;
    const data = await listRes.json() as any;
    const captions = Array.isArray(data?.captions) ? data.captions : (Array.isArray(data) ? data : []);
    const cap = captions.find((c: any) => String(c?.label || c?.language || '').toLowerCase().includes('english')) || captions[0];
    if (!cap?.url) return null;
    const capUrl = /^https?:\/\//i.test(cap.url) ? cap.url : `${base}${cap.url}`;
    const capRes = await fetch(capUrl, { signal: AbortSignal.timeout(1800) });
    if (!capRes.ok) return null;
    const cleaned = cleanCaptionText(await capRes.text());
    if (cleaned.length < 50) return null;
    return { text: cleaned, segments: [], source: 'invidious-relay', ghostNode: base.replace(/^https?:\/\//, '').split('.')[0].toUpperCase() };
  } catch {
    return null;
  }
}

async function fetchViaInvidious(videoId: string): Promise<TranscriptResult | null> {
  return firstValid(INVIDIOUS_NODES.map((base) => fetchInvidiousNode(base, videoId)), 2300);
}

function transcriptEnvelope(videoId: string, result: TranscriptResult, extras: Record<string, unknown> = {}) {
  return {
    videoId,
    transcript: result.text,
    segments: result.segments,
    source: result.source,
    ghostNode: result.ghostNode,
    length: result.text.length,
    wordCount: result.text.split(/\s+/).filter(Boolean).length,
    ...extras,
  };
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const bodyResult = await safeJsonBody(req);
    if (bodyResult.error) return jsonResponse({ error: bodyResult.error }, 400);
    const { url, lang = 'en' } = bodyResult.data;

    if (!url || typeof url !== 'string') return jsonResponse({ error: 'YouTube URL required' }, 400);
    const videoId = extractId(url.trim());
    if (!videoId) return jsonResponse({ error: 'Invalid YouTube URL' }, 400);

    const startedAt = Date.now();
    const liveResult = await firstValid<TranscriptResult>([
      fetchViaYoutubeDirect(videoId, String(lang || 'en')),
      fetchViaPiped(videoId),
      fetchViaInvidious(videoId),
    ], 5000);

    if (liveResult) {
      return jsonResponse(transcriptEnvelope(videoId, liveResult, {
        elapsedMs: Date.now() - startedAt,
        timeoutBudgetMs: 5000,
      }));
    }

    // Honest no-captions signal — never fabricate a transcript.
    return jsonResponse({
      videoId,
      transcript: null,
      segments: [],
      source: 'no-captions',
      noCaptions: true,
      length: 0,
      wordCount: 0,
      elapsedMs: Date.now() - startedAt,
      timeoutBudgetMs: 5000,
      message: 'No captions found for this video. Paste your script manually instead.',
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[transcript:edge] fatal:', msg);
    return jsonResponse({
      videoId: 'unknown',
      transcript: null,
      segments: [],
      source: 'no-captions',
      noCaptions: true,
      length: 0,
      wordCount: 0,
      message: 'No captions found for this video. Paste your script manually instead.',
      warning: msg,
    });
  }
}
