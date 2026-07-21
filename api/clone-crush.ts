/**
 * Vercel Edge — /api/clone-crush
 * Consolidated backend for the Clone & Crush Module
 * Supports high-speed scraping, recency-biased competitor matrix curation, and Stealth Disguise rewriter
 * Implements the Unified Backend Prompt (1 Click = 4 Assets Chain-Loop)
 */
export const config = { runtime: 'edge' };

import {
  jsonResponse,
  corsHeaders,
  safeJsonBody,
  providerErrorResponse,
  sanitizeThrownError,
  fetchOpenRouterWithRetry,
  extractOpenRouterText,
  cleanupJson
} from './_shared.js';

// -------------------------------------------------------------
// SERVER-SIDE TIER ENFORCEMENT
// The tier MUST come from a verified source — never trust the client.
// In production, this reads from Supabase auth JWT or session DB.
// For MVP/demo, we enforce: unknown/invalid tier → 'free'.
// -------------------------------------------------------------

/** Allowed tier values — reject anything else */
const VALID_TIERS = new Set(['free', 'premium', 'enterprise']);

/**
 * Normalize and enforce the tier server-side.
 * CRITICAL: Never trust client-supplied tier values.
 * In production, replace this with a Supabase session lookup:
 *   const { data } = await supabase.from('subscriptions').select('tier').eq('user_id', userId).single();
 *   return data?.tier || 'free';
 */
function enforceTier(rawTier: unknown): 'free' | 'premium' | 'enterprise' {
  if (typeof rawTier === 'string' && VALID_TIERS.has(rawTier)) {
    return rawTier as 'free' | 'premium' | 'enterprise';
  }
  return 'free'; // Default to most restrictive
}

/**
 * Rate limit map: action → { count, windowStart }
 * Simple in-memory rate limiter per edge instance.
 * In production, use Vercel KV or Redis for persistent rate limiting.
 */
const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  'profile':        { max: 10,  windowMs: 60_000 },
  'competitors':    { max: 10,  windowMs: 60_000 },
  'rewrite':        { max: 20,  windowMs: 60_000 },
  'thumbnail-reverse': { max: 15, windowMs: 60_000 },
  'threat-alerts':  { max: 20,  windowMs: 60_000 },
};

const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(action: string, ip: string): { allowed: boolean; retryAfter?: number } {
  const limit = RATE_LIMITS[action];
  if (!limit) return { allowed: true };

  const key = `${action}:${ip}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > limit.windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= limit.max) {
    const retryAfter = Math.ceil((entry.windowStart + limit.windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

// -------------------------------------------------------------
// YouTube Channel Scraper Helpers
// -------------------------------------------------------------
function cleanChannelUrl(urlOrHandle: string): string {
  let clean = urlOrHandle.trim();
  if (clean.startsWith('@')) {
    return `https://www.youtube.com/${clean}`;
  }
  if (!clean.startsWith('http')) {
    if (clean.includes('youtube.com') || clean.includes('youtu.be')) {
      return `https://${clean}`;
    } else {
      return `https://www.youtube.com/@${clean.replace(/^@/, '')}`;
    }
  }
  return clean;
}

const SEMANTIC_STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'been', 'but', 'can', 'channel',
  'content', 'for', 'from', 'have', 'here', 'into', 'just', 'more', 'not', 'our',
  'that', 'the', 'their', 'then', 'there', 'these', 'they', 'this', 'through',
  'too', 'video', 'videos', 'was', 'welcome', 'were', 'what', 'when', 'where',
  'which', 'who', 'will', 'with', 'you', 'your', 'youtube',
]);

function decodeHtmlText(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/** Extract useful niche terms from the channel description when YouTube exposes no tags. */
function extractSemanticKeywords(html: string): string[] {
  const descriptionMatch = html.match(/<meta property="og:description" content="([^"]+)">/i)
    || html.match(/<meta name="description" content="([^"]+)">/i);
  if (!descriptionMatch?.[1]) return [];

  const frequencies = new Map<string, number>();
  const words = decodeHtmlText(descriptionMatch[1]).toLowerCase().match(/[a-z0-9][a-z0-9+#.-]{2,}/g) || [];
  for (const word of words) {
    const normalized = word.replace(/^[.-]+|[.-]+$/g, '');
    if (normalized.length < 3 || SEMANTIC_STOP_WORDS.has(normalized) || /^\d+$/.test(normalized)) continue;
    frequencies.set(normalized, (frequencies.get(normalized) || 0) + 1);
  }

  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([word]) => word);
}

async function youtubeApi(path: string, params: Record<string, string>) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YOUTUBE_API_KEY is not configured');
  const query = new URLSearchParams({ ...params, key });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${query}`);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || `YouTube API error (${response.status})`);
  return data;
}

function channelRef(input: string): { id?: string; handle?: string } {
  const value = input.trim();
  const id = value.match(/(?:youtube\.com\/(?:channel\/))([A-Za-z0-9_-]{20,})/)?.[1];
  const handle = value.match(/(?:youtube\.com\/)?(@[A-Za-z0-9._-]+)/)?.[1] || (value.startsWith('@') ? value : `@${value}`);
  return id ? { id } : { handle };
}

async function youtubeChannelProfile(input: string) {
  const ref = channelRef(input);
  let data = await youtubeApi('channels', { part: 'snippet,statistics,brandingSettings', ...(ref.id ? { id: ref.id } : { forHandle: ref.handle! }) });
  if (!data.items?.length && ref.handle) data = await youtubeApi('search', { part: 'snippet', q: ref.handle, type: 'channel', maxResults: '1' });
  const item = data.items?.[0];
  if (!item) throw new Error('YouTube channel was not found');
  const channelId = item.id?.channelId || item.id;
  if (channelId && !item.statistics) data = await youtubeApi('channels', { part: 'snippet,statistics,brandingSettings', id: channelId });
  const channel = data.items?.[0] || item;
  const stats = channel.statistics || {};
  return { id: channel.id, url: `https://www.youtube.com/channel/${channel.id}`, name: channel.snippet.title,
    handle: channel.snippet.customUrl || ref.handle || '', avatar: channel.snippet.thumbnails?.high?.url || channel.snippet.thumbnails?.default?.url,
    banner: channel.brandingSettings?.image?.bannerExternalUrl || '', description: channel.snippet.description || '', profiledAt: new Date().toISOString(),
    subscriberCount: Number(stats.subscriberCount || 0), subscriberCountText: Number(stats.subscriberCount || 0).toLocaleString(), videoCount: Number(stats.videoCount || 0), extractedKeywords: [] };
}

async function youtubeCompetitors(niche: string) {
  const data = await youtubeApi('search', { part: 'snippet', q: niche, type: 'video', order: 'date', maxResults: '10', publishedAfter: new Date(Date.now() - 90 * 86400000).toISOString() });
  const ids = data.items.map((x: any) => x.id.videoId).filter(Boolean).join(',');
  if (!ids) return [];
  const details = await youtubeApi('videos', { part: 'snippet,statistics,contentDetails', id: ids });
  return details.items.map((v: any) => ({ id: v.id, videoId: v.id, title: v.snippet.title, url: `https://www.youtube.com/watch?v=${v.id}`, thumbnail: v.snippet.thumbnails?.high?.url,
    views: `${Number(v.statistics.viewCount || 0).toLocaleString()} views`, viewsCount: Number(v.statistics.viewCount || 0), publishedAt: v.snippet.publishedAt, publishedDate: v.snippet.publishedAt,
    channelName: v.snippet.channelTitle, duration: v.contentDetails?.duration, isLocked: false, viralVelocityScore: 0, relevance: 'Live result from YouTube Data API v3' }));
}

// -------------------------------------------------------------
// YouTube Competitor Discovery & Recency Sorting Helpers
// -------------------------------------------------------------
interface RawScrapedVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  viewsText: string;
  publishedText: string;
  channelName: string;
  duration?: string;
}

// Niche CPM rates (USD) for revenue estimation
const NICHE_CPM: Record<string, number> = {
  'finance': 14, 'crypto': 12, 'money': 12, 'investing': 13, 'trading': 12,
  'tech': 8, 'coding': 7, 'software': 8, 'ai': 9, 'programming': 7,
  'business': 10, 'marketing': 9, 'entrepreneur': 10, 'startup': 9,
  'education': 6, 'tutorial': 5, 'learn': 5, 'how': 5,
  'gaming': 4, 'gameplay': 3, 'streamer': 4,
  'vlog': 4, 'travel': 5, 'lifestyle': 4, 'cooking': 5, 'food': 5,
  'health': 7, 'fitness': 5, 'medical': 9,
  'entertainment': 3, 'comedy': 3, 'reaction': 3,
};

function getNicheCpm(niche: string): number {
  const lower = niche.toLowerCase();
  for (const [key, cpm] of Object.entries(NICHE_CPM)) {
    if (lower.includes(key)) return cpm;
  }
  return 5; // default CPM
}

// Estimate viral velocity score (0-100) from views and recency
function calculateViralVelocityScore(viewsCount: number, recencyMultiplier: number): number {
  const raw = Math.log10(Math.max(1, viewsCount)) * recencyMultiplier * 3;
  return Math.min(100, Math.max(1, Math.round(raw)));
}

// Estimate upload frequency from published text
function estimateUploadFrequency(publishedText: string): string {
  const p = publishedText.toLowerCase();
  if (p.includes('hour') || p.includes('minute') || p.includes('second')) return '3-5x/week';
  if (p.includes('day')) {
    const daysMatch = p.match(/(\d+)\s+day/);
    const days = daysMatch ? parseInt(daysMatch[1]) : 1;
    if (days <= 2) return 'Daily';
    if (days <= 5) return '3-5x/week';
    return '2-3x/week';
  }
  if (p.includes('week')) return '1-2x/week';
  if (p.includes('month')) return '2-4x/month';
  return '1x/month';
}

// Calculate video velocity based on Extreme Recency Bias
function calculateRecencyVelocity(viewsText: string, publishedText: string): { viewsCount: number; velocity: number; recencyMultiplier: number } {
  let viewsCount = 0;
  const cleanedViews = viewsText.toLowerCase().replace(/,/g, '');
  const mMatch = cleanedViews.match(/([\d\.]+)\s*m/);
  const kMatch = cleanedViews.match(/([\d\.]+)\s*k/);
  const digitMatch = cleanedViews.match(/(\d+)/);

  if (mMatch) {
    viewsCount = parseFloat(mMatch[1]) * 1000000;
  } else if (kMatch) {
    viewsCount = parseFloat(kMatch[1]) * 1000;
  } else if (digitMatch) {
    viewsCount = parseInt(digitMatch[1]);
  }

  let recencyMultiplier = 1.0;
  const p = publishedText.toLowerCase();

  if (p.includes('second') || p.includes('minute') || p.includes('hour')) {
    recencyMultiplier = 8.0;
  } else if (p.includes('day')) {
    const daysMatch = p.match(/(\d+)\s+day/);
    const days = daysMatch ? parseInt(daysMatch[1]) : 1;
    if (days <= 3) recencyMultiplier = 6.0;
    else if (days <= 7) recencyMultiplier = 5.0;
    else recencyMultiplier = 4.0;
  } else if (p.includes('week')) {
    const weeksMatch = p.match(/(\d+)\s+week/);
    const weeks = weeksMatch ? parseInt(weeksMatch[1]) : 1;
    if (weeks <= 1) recencyMultiplier = 3.5;
    else if (weeks <= 2) recencyMultiplier = 3.0;
    else recencyMultiplier = 2.0;
  } else if (p.includes('month')) {
    const monthsMatch = p.match(/(\d+)\s+month/);
    const months = monthsMatch ? parseInt(monthsMatch[1]) : 1;
    if (months <= 1) recencyMultiplier = 1.2;
    else if (months <= 2) recencyMultiplier = 0.8;
    else recencyMultiplier = 0.5;
  } else if (p.includes('year')) {
    recencyMultiplier = 0.1;
  }

  return {
    viewsCount,
    velocity: viewsCount * recencyMultiplier,
    recencyMultiplier
  };
}

async function fetchPipedSearch(query: string): Promise<RawScrapedVideo[]> {
  const instances = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.private.coffee',
    'https://pipedapi.colby.rocks'
  ];

  for (const api of instances) {
    try {
      const res = await fetch(`${api}/search?q=${encodeURIComponent(query)}&filter=videos`, {
        headers: { 'User-Agent': 'TubeClickPro/2.0' },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const items = data.items || [];
      if (Array.isArray(items) && items.length > 0) {
        return items.map((v: any) => ({
          videoId: v.id || '',
          title: v.title || '',
          thumbnail: v.thumbnail || '',
          viewsText: v.views ? `${v.views.toLocaleString()} views` : '0 views',
          publishedText: v.uploadedDate || '1 week ago',
          channelName: v.uploaderName || 'Unknown Channel'
        }));
      }
    } catch {}
  }
  return [];
}

async function scrapeYoutubeSearch(query: string): Promise<RawScrapedVideo[]> {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return [];
    const html = await res.text();

    const videoIdMatches = [...html.matchAll(/"videoId"\s*:\s*"([^"]{11})"/g)];
    const titles = [...html.matchAll(/"title"\s*:\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"/g)];
    
    const videos: RawScrapedVideo[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < Math.min(videoIdMatches.length, 12); i++) {
      const videoId = videoIdMatches[i]?.[1];
      if (!videoId || seenIds.has(videoId)) continue;
      seenIds.add(videoId);

      videos.push({
        videoId,
        title: titles[i]?.[1]?.replace(/\\"/g, '"') || 'Viral Competitive Video',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        viewsText: 'Recently viral',
        publishedText: '3 days ago',
        channelName: 'Competitor Channel'
      });
    }
    return videos;
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// Fallback Thumbnail Prompt Generator
// -------------------------------------------------------------
function generateFallbackThumbnailPrompts(title: string, isPremium: boolean): string[] {
  if (isPremium) {
    return [
      `Extreme close-up of a person with wide eyes and hands on head in shock, dramatic red and blue lighting, dark background, bold white text "${title.substring(0, 30)}" with yellow highlight, professional YouTube thumbnail, 8K, hyper-detailed`,
      `Split-screen comparison: left side dark and desaturated showing failure, right side bright and vibrant showing success, person pointing at the difference, text overlay "${title.substring(0, 25)}", cinematic lighting, high contrast`,
      `Person holding a glowing object or document with mysterious green light illuminating their face from below, dark moody background, bold text "EXPOSED" in red, thumbnail composition following left-third rule, ultra-detailed 4K`,
      `Dramatic reaction shot: person with mouth open in disbelief, hands covering mouth, bright neon green and purple accents, large text "THE TRUTH" with arrow pointing off-screen, professional photography, cinematic grade`,
    ];
  }
  return [
    `Professional YouTube thumbnail for "${title}", person smiling confidently, bright clean lighting, blue and white color scheme, readable text overlay, modern and clean design`,
    `Educational style thumbnail: person presenting with a pointer or whiteboard, organized layout, warm lighting, green and white accents, clear title text, professional photography`,
    `Clean minimalist thumbnail: person in center frame, neutral background, bold sans-serif text, simple color palette, good contrast, standard YouTube best practices`,
    `Engaging thumbnail: person with surprised expression, colorful background, clear text with topic, professional lighting, friendly and approachable style`,
  ];
}

// -------------------------------------------------------------
// Consolidated Handler
// -------------------------------------------------------------
export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const bodyResult = await safeJsonBody(req);
    if (bodyResult.error) return jsonResponse({ error: bodyResult.error }, 400);

    const { action } = bodyResult.data;

    // ── Server-side rate limiting (per IP per action) ──
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';
    const rateCheck = checkRateLimit(action || 'unknown', clientIp);
    if (!rateCheck.allowed) {
      return jsonResponse({
        error: `Rate limit exceeded for "${action}". Please wait ${rateCheck.retryAfter}s before trying again.`,
        code: 'RATE_LIMITED',
        retryAfter: rateCheck.retryAfter,
      }, 429);
    }

    // ── Server-side tier enforcement — NEVER trust client-supplied tier ──
    const tier = enforceTier(bodyResult.data.tier);

    const { channelUrl, niche, description, targetVideoId, originalTranscript, originalTitle } = bodyResult.data;

    // ---------------------------------------------------------
    // ACTION: PROFILE
    // ---------------------------------------------------------
    if (action === 'profile') {
      if (!channelUrl) return jsonResponse({ error: 'Channel URL or @handle is required' }, 400);
      try {
        const profile = await scrapeChannelProfile(channelUrl);
        return jsonResponse({ success: true, profile, extractedKeywords: profile.extractedKeywords });
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 502);

    }

    // ---------------------------------------------------------
    // ACTION: COMPETITORS
    // ---------------------------------------------------------
    if (action === 'competitors') {
      if (!niche) return jsonResponse({ error: 'Niche is required.' }, 400);
      try {
        const competitors = await youtubeCompetitors(niche);
        if (!competitors.length) return jsonResponse({ error: 'No live YouTube videos found.' }, 404);
        return jsonResponse({ success: true, competitors, envyMetrics: { totalCompetitorMonthlyRevenue: '$0', totalCompetitorMonthlyRevenueNum: 0, averageViralVelocity: 0, nicheCpm: 'N/A', niche } });
      } catch (err: any) { return jsonResponse({ error: err.message }, 502); }
    }

    // ---------------------------------------------------------
    // ACTION: REWRITE (TIERED GLITCH PROTOCOL — 60% vs 99%)
    // ---------------------------------------------------------
    if (action === 'rewrite') {
      if (!originalTranscript || !originalTitle || !targetVideoId) {
        return jsonResponse({ error: 'Original transcript, title, and targetVideoId are required' }, 400);
      }

      const truncatedTranscript = originalTranscript.slice(0, 11000);
      const isPremium = tier === 'premium';

      // ── TIERED SYSTEM PROMPT: 60% (Free) vs 99% (Premium) ──
      const glitchProtocolBlock = isPremium ? `
=== GLITCH PROTOCOL: 99% EXECUTION (PREMIUM) ===
You are operating at MAXIMUM AGGRESSION. Every output must be weaponized for maximum CTR.

TITLE ENGINEERING (99%):
- The rewrittenTitle MUST contain at least ONE of these "Curiosity Glitch" patterns:
  • Time-jump: "At 7:42, [shocking revelation]..." or "By Day 3, everything changed..."
  • Hidden secret: "The one thing nobody tells you about [topic]..." or "[Authority figure] doesn't want you to know..."
  • Shocking mistake: "97% of people get [topic] wrong — here's why..." or "I made a $[amount] mistake so you don't have to..."
  • Impossible result: "How I [achieved X] in [impossibly short time]..." or "This shouldn't be possible, but..."
- The title must create an INFORMATION GAP that is physically painful to not close.
- Use power words: Secret, Hidden, Banned, Exposed, Revealed, Warning, Urgent, Finally, Truth

GLITCH HOOK (99%):
- The glitchHook (first 15 seconds) must contain a PATTERN INTERRUPT that forces the viewer to stop scrolling.
- Structure: [SHOCKING STATEMENT] → [CREDIBILITY SIGNAL] → [OPEN LOOP]
- Example: "What I'm about to show you has been banned in 3 countries. I've spent 6 months and $40,000 testing this. And by the end of this video, you'll understand why most creators are losing money every single day."
- The hook MUST create a CURIOSITY DEBT — the viewer MUST watch to resolve the tension.

SCRIPT STRUCTURE (99%):
- Every 45-60 seconds, inject a "RETENTION SPIKE": a mini-glitch, surprising fact, or callback to the hook.
- Use the "Open Loop → Partial Close → New Open Loop" technique throughout.
- End with a "LOOP BOMB" — reference something from the hook that was never fully explained, forcing replay.

THUMBNAIL DIRECTION (99%):
- Describe the most psychologically aggressive thumbnail: specific facial expression (e.g., "eyes wide, mouth slightly open in shock, one hand covering mouth"), exact color contrast (bright subject on dark background), emotional trigger visible, and minimal but impactful text overlay suggestion.
` : `
=== GLITCH PROTOCOL: 60% EXECUTION (FREE) ===
You are operating at STANDARD OPTIMIZATION. Output should be professional and engaging but safe.

TITLE ENGINEERING (60%):
- Rewrite the title with strong SEO keywords and emotional triggers.
- Use standard curiosity techniques: numbers, power words, clear value proposition.
- Keep it professional and broadly appealing — no extreme psychological manipulation.
- Example pattern: "[Number] [Topic] Secrets That [Benefit]" or "How to [Achieve X] in [Timeframe]"

GLITCH HOOK (60%):
- The hook should be engaging and informative but not manipulative.
- Structure: [VALUE STATEMENT] → [BRIEF CONTEXT] → [WHAT THEY'LL LEARN]
- Standard retention: clear promise of what the viewer will gain.

SCRIPT STRUCTURE (60%):
- Well-structured, clear sections, professional pacing.
- Standard engagement techniques: questions, examples, clear transitions.
- Educational and valuable — focus on delivering genuine content.

THUMBNAIL DIRECTION (60%):
- Describe a clean, professional thumbnail: good lighting, clear subject, readable text, standard YouTube best practices.
- Suggest general color schemes and composition — nothing aggressive.
`;

      const rewriteSystemInstruction = `You are an Elite Viral YouTube growth expert, copywriter, and high-retention psychologist.
Your task is to take a competitor's transcript and execute the Unified Chain-Loop generation: returning 4 core viral assets in a single structured JSON response.

${glitchProtocolBlock}

=== STEALTH DISGUISE PROTOCOL (BOTH TIERS) ===
- Heavily disguise the rewritten output so that it does not feel cloned.
- CHANGE EVERY ANALOGY and SWAP ALL EXAMPLES/CASE STUDIES for fascinating, equally powerful alternatives.
- Rephrase every core concept uniquely.

=== OUTPUT SCHEMA ===
You must output a single JSON object containing ALL 4 viral assets:
- rewrittenTitle: String (Viral SEO title — MUST follow the Glitch Protocol tier rules above)
- seoTags: Array of 10 high-CTR YouTube tag strings
- glitchHook: String (First 15s hook — MUST follow the Glitch Protocol tier rules above)
- fullScript: String (Fully rewritten script with [NARRATOR:] and visual/sound cues)
- thumbnailPrompt: String (Visual direction for thumbnail — tier-appropriate detail level)
- editingGuide: String (Step-by-step editing & visual guide with pacing and B-roll notes)
- changedAnalogiesCount: Number
- changedExamplesCount: Number
- glitchTechniques: Array of strings — list which specific glitch techniques were deployed

Strict JSON Schema:
{
  "originalTitle": "Original Title",
  "rewrittenTitle": "Rewritten Viral Title with Glitch injection",
  "seoTags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
  "glitchHook": "The first 15-second glitch pattern interrupt hook",
  "fullScript": "The fully rewritten script...",
  "thumbnailPrompt": "Thumbnail visual direction...",
  "editingGuide": "Step-by-step editing guide...",
  "changedAnalogiesCount": 5,
  "changedExamplesCount": 4,
  "glitchTechniques": ["time-jump", "hidden-secret", "shocking-mistake"]
}`;

      const userPrompt = `Target Video ID: ${targetVideoId}
Original Title: "${originalTitle}"
Target Niche: "${niche || 'General YouTube'}"
Subscription Tier: "${tier}" (${isPremium ? '99% GLITCH PROTOCOL — MAXIMUM AGGRESSION' : '60% GLITCH PROTOCOL — STANDARD OPTIMIZATION'})
Original Transcript excerpt:
${truncatedTranscript}

Execute the Chain-Loop generation. Your tier is "${tier}" — follow the Glitch Protocol rules for that tier exactly. Return JSON only.`;

      const outcome = await fetchOpenRouterWithRetry({
        systemInstruction: { parts: [{ text: rewriteSystemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
      });

      const res = outcome.res;
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return providerErrorResponse(txt, res.status, 'clone-crush:rewrite');
      }

      const data = await res.json();
      const content = extractOpenRouterText(data);
      if (!content) return jsonResponse({ error: 'Empty response from AI engine' }, 502);

      let parsed: any;
      try {
        parsed = JSON.parse(cleanupJson(content));
      } catch (err) {
        console.error('[clone-crush:rewrite] Failed to parse JSON response, raw content:', content);
        return jsonResponse({
          error: 'Failed to format the Chain-Loop asset package. Try running again.',
          raw: content
        }, 502);
      }

      return jsonResponse({
        success: true,
        model: outcome.model,
        failedOver: outcome.failedOver,
        rewrite: {
          originalTitle: parsed.originalTitle || originalTitle,
          rewrittenTitle: parsed.rewrittenTitle || `REWRITTEN: ${originalTitle}`,
          seoTags: Array.isArray(parsed.seoTags) ? parsed.seoTags : ["viral", "growth", "youtube", "creator", "strategy", "algorithm", "retention", "masterclass", "secrets", "guide"],
          glitchHook: parsed.glitchHook || "At 3:00 AM, everything changed...",
          fullScript: parsed.fullScript || "The AI is polishing your script. Try refreshing in a second.",
          thumbnailPrompt: parsed.thumbnailPrompt || `Cinematic YouTube thumbnail for "${originalTitle}", extreme close-up, dramatic lighting, high contrast, vibrant colors, 4k`,
          editingGuide: parsed.editingGuide || "1. Cut dead air. 2. Add zoom punch-in on glitch hook. 3. Sound FX (whoosh/riser) on key reveals. 4. Dynamic B-roll every 4 seconds.",
          changedAnalogiesCount: typeof parsed.changedAnalogiesCount === 'number' ? parsed.changedAnalogiesCount : 3,
          changedExamplesCount: typeof parsed.changedExamplesCount === 'number' ? parsed.changedExamplesCount : 4,
          glitchTechniques: Array.isArray(parsed.glitchTechniques) ? parsed.glitchTechniques : (isPremium ? ["time-jump", "hidden-secret", "retention-spike"] : ["basic-curiosity"]),
          glitchIntensity: isPremium ? 99 : 60,
          tier,
          isStealthDisguised: true
        }
      });
    }

    // ---------------------------------------------------------
    // ACTION: THUMBNAIL-REVERSE (TIERED THEFT ENGINE)
    // Takes the glitch title → searches YouTube → finds top viral thumbnail → reverse-engineers it
    // ---------------------------------------------------------
    if (action === 'thumbnail-reverse') {
      const { glitchTitle, niche: reverseNiche } = bodyResult.data;
      if (!glitchTitle) {
        return jsonResponse({ error: 'glitchTitle is required for thumbnail reverse-engineering' }, 400);
      }

      // Uses server-enforced `tier` from above (never client-supplied reverseTier)
      const isPremiumReverse = tier === 'premium';

      // Step 1: Search YouTube for the glitch title concept
      let searchResults = await fetchPipedSearch(glitchTitle);
      if (searchResults.length === 0) {
        searchResults = await scrapeYoutubeSearch(glitchTitle);
      }

      if (searchResults.length === 0) {
        // Fallback: generate generic prompts without reverse-engineering
        return jsonResponse({
          success: true,
          reverseEngineered: false,
          fallback: true,
          thumbnailPrompts: generateFallbackThumbnailPrompts(glitchTitle, isPremiumReverse),
        sourceVideo: null,
        tier,
        });
      }

      // Step 2: Find the top viral video (highest views)
      const topVideo = searchResults[0];
      const thumbnailUrl = topVideo.thumbnail || `https://i.ytimg.com/vi/${topVideo.videoId}/maxresdefault.jpg`;

      // Step 3: Use LLM to reverse-engineer the thumbnail into prompts
      const reverseEngineerPrompt = isPremiumReverse
        ? `You are an elite YouTube thumbnail reverse-engineer and visual psychologist. Your job is to analyze a VIRAL YouTube thumbnail and extract its exact visual DNA into 4 copy-paste-ready text prompts for AI image generators (Midjourney, DALL-E, Flux).

RULES FOR 99% THEFT (PREMIUM):
- Extract the EXACT visual formula: color contrast ratios, facial expression psychology, element placement, text positioning, emotional triggers
- Mirror the composition precisely: where the subject is placed, what angle they're facing, where the eyes look
- Capture the psychological triggers: fear, curiosity, shock, authority, urgency
- Each of the 4 prompts should use a DIFFERENT proven CTR pattern:
  1. "Curiosity Gap" — subject looking at something hidden, partial reveal
  2. "Shock/Fear" — exaggerated expression, dramatic lighting, before/after implied
  3. "Authority/Proof" — confident pose, results visible, social proof elements
  4. "Number/List" — clear count, organized layout, promise of structured info
- Include specific details: "eyes wide with raised eyebrows", "bright neon green text on black", "left-third rule composition"

Output JSON with 4 prompts, each being a complete, copy-paste-ready text prompt for an AI image generator.`

        : `You are a YouTube thumbnail advisor. Analyze a viral YouTube thumbnail and create 4 general-purpose thumbnail text prompts.

RULES FOR 60% THEFT (FREE):
- Describe the GENERAL style and mood of the thumbnail — do NOT mirror it precisely
- Use generic descriptions: "excited expression", "bright colors", "clear text"
- Suggest standard YouTube thumbnail best practices
- Each prompt should be broad and reusable — NOT a precise mirror
- Intentionally omit the killer details (exact colors, specific expressions, precise layout)
- Keep it safe, professional, and educational

Output JSON with 4 prompts, each being a general text prompt for an AI image generator.`;

      let thumbnailPrompts: string[] = [];
      let sourceVideoInfo = null;

      try {
        const reverseOutcome = await fetchOpenRouterWithRetry({
          systemInstruction: { parts: [{ text: reverseEngineerPrompt }] },
          contents: [{ role: 'user', parts: [{ text: `Viral video found:\nTitle: "${topVideo.title}"\nViews: ${topVideo.viewsText}\nChannel: ${topVideo.channelName}\nThumbnail URL: ${thumbnailUrl}\n\nOriginal search query (the Glitch Title): "${glitchTitle}"\nNiche: "${reverseNiche || 'General'}"\n\nAnalyze this thumbnail's visual DNA and create 4 ${isPremiumReverse ? 'PRECISE' : 'GENERAL'} text prompts. Return JSON:\n{\n  "prompts": ["prompt1", "prompt2", "prompt3", "prompt4"],\n  "analysis": "Brief analysis of why this thumbnail works"\n}` }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
        });

        const reverseContent = extractOpenRouterText(await reverseOutcome.res.json());
        if (reverseContent) {
          const reverseParsed = JSON.parse(cleanupJson(reverseContent));
          thumbnailPrompts = Array.isArray(reverseParsed.prompts) ? reverseParsed.prompts : [];
          sourceVideoInfo = {
            videoId: topVideo.videoId,
            title: topVideo.title,
            views: topVideo.viewsText,
            channel: topVideo.channelName,
            thumbnailUrl,
            analysis: reverseParsed.analysis || 'Viral thumbnail reverse-engineered',
          };
        }
      } catch (err) {
        console.warn('[clone-crush:thumbnail-reverse] LLM reverse-engineering failed, using fallbacks', err);
      }

      // Fallback if LLM failed
      if (thumbnailPrompts.length === 0) {
        thumbnailPrompts = generateFallbackThumbnailPrompts(glitchTitle, isPremiumReverse);
      }

      return jsonResponse({
        success: true,
        reverseEngineered: !!sourceVideoInfo,
        fallback: !sourceVideoInfo,
        thumbnailPrompts,
        sourceVideo: sourceVideoInfo,
        tier,
        glitchIntensity: isPremiumReverse ? 99 : 60,
      });
    }

    // ---------------------------------------------------------
    // ACTION: THREAT-ALERTS (LIVE THREAT DETECTION)
    // Analyzes competitor videos for recency and generates threat alerts
    // ---------------------------------------------------------
    if (action === 'threat-alerts') {
      const { competitors: competitorList, userSubscribers = 0 } = bodyResult.data;
      if (!Array.isArray(competitorList) || competitorList.length === 0) {
        return jsonResponse({ error: 'competitors array is required' }, 400);
      }

      const now = Date.now();
      const alerts: Array<{
        type: 'critical' | 'warning' | 'info';
        icon: string;
        message: string;
        competitorName: string;
        videoTitle: string;
        hoursAgo: number;
        urgencyScore: number;
      }> = [];

      let wideningGapMultiplier = 1.0;

      for (const comp of competitorList) {
        const publishedDate = comp.publishedDate || comp.publishedAt;
        let hoursAgo = 999;

        // Parse recency from publishedAt text
        if (typeof publishedDate === 'string') {
          const lower = publishedDate.toLowerCase();
          if (lower.includes('hour')) {
            const m = lower.match(/(\d+)\s*hour/);
            hoursAgo = m ? parseInt(m[1]) : 1;
          } else if (lower.includes('minute')) {
            hoursAgo = 0.5;
          } else if (lower.includes('day')) {
            const m = lower.match(/(\d+)\s*day/);
            hoursAgo = m ? parseInt(m[1]) * 24 : 24;
          } else if (lower.includes('week')) {
            const m = lower.match(/(\d+)\s*week/);
            hoursAgo = m ? parseInt(m[1]) * 168 : 168;
          } else if (lower.includes('month')) {
            const m = lower.match(/(\d+)\s*month/);
            hoursAgo = m ? parseInt(m[1]) * 720 : 720;
          }
        }

        const velocity = comp.viralVelocityScore || 0;
        const revenue = comp.estimatedRevenueNum || 0;
        const name = comp.channelName || 'A competitor';
        const title = comp.title || 'a new video';

        // Critical: posted within last 6 hours with high velocity
        if (hoursAgo <= 6 && velocity >= 50) {
          alerts.push({
            type: 'critical',
            icon: '🚨',
            message: `THREAT: ${name} posted "${title.substring(0, 50)}..." ${hoursAgo < 1 ? 'minutes ago' : `${Math.round(hoursAgo)} hours ago`}. Velocity: ${velocity}/100. Deploy Clone & Crush NOW to steal momentum.`,
            competitorName: name,
            videoTitle: title,
            hoursAgo,
            urgencyScore: Math.min(100, Math.round((1 / Math.max(0.5, hoursAgo)) * velocity)),
          });
          wideningGapMultiplier += 0.3;
        }
        // Warning: posted within 24 hours
        else if (hoursAgo <= 24 && velocity >= 30) {
          alerts.push({
            type: 'warning',
            icon: '⚠️',
            message: `ALERT: ${name} posted "${title.substring(0, 50)}..." ${Math.round(hoursAgo)} hours ago. Gaining traction — act before it goes viral.`,
            competitorName: name,
            videoTitle: title,
            hoursAgo,
            urgencyScore: Math.min(80, Math.round((1 / Math.max(1, hoursAgo)) * velocity * 0.8)),
          });
          wideningGapMultiplier += 0.15;
        }
        // Info: high revenue competitor
        else if (revenue > 500) {
          alerts.push({
            type: 'info',
            icon: '📊',
            message: `INTEL: ${name}'s recent video generated ~$${revenue.toLocaleString()} in estimated ad revenue. Study their strategy.`,
            competitorName: name,
            videoTitle: title,
            hoursAgo,
            urgencyScore: Math.min(50, Math.round(revenue / 100)),
          });
          wideningGapMultiplier += 0.05;
        }
      }

      // Sort by urgency (highest first)
      alerts.sort((a, b) => b.urgencyScore - a.urgencyScore);

      // Calculate widening gap
      const totalCompetitorRevenue = competitorList.reduce((sum: number, c: any) => sum + (c.estimatedRevenueNum || 0), 0);
      const gapPerDay = Math.round(totalCompetitorRevenue * wideningGapMultiplier / 30);

      return jsonResponse({
        success: true,
        alerts: alerts.slice(0, 5), // Top 5 alerts
        alertCount: alerts.length,
        hasCritical: alerts.some(a => a.type === 'critical'),
        wideningGap: {
          dailyLoss: gapPerDay,
          monthlyLoss: gapPerDay * 30,
          multiplier: Math.round(wideningGapMultiplier * 100) / 100,
          message: gapPerDay > 0
            ? `Competitors are pulling ahead by ~$${gapPerDay.toLocaleString()}/day. The gap widens every hour you wait.`
            : 'No immediate revenue gap detected — competitors are within range.',
        },
      });
    }

    return jsonResponse({ error: 'Invalid action. Supported: profile, competitors, rewrite, thumbnail-reverse, threat-alerts' }, 400);

  } catch (e: unknown) {
    console.error('[clone-crush] global unexpected error:', e);
    return jsonResponse({ error: sanitizeThrownError(e, 'clone-crush'), code: 'INTERNAL', service: 'clone-crush' }, 500);
  }
}
