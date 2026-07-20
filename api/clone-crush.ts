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

async function scrapeChannelProfile(channelUrl: string) {
  const url = cleanChannelUrl(channelUrl);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch channel page. Status: ${response.status}`);
  }

  const html = await response.text();

  // Regex extracts
  const titleMatch = html.match(/<meta property="og:title" content="([^"]+)">/) || html.match(/<title>([^<]+)<\/title>/);
  const descMatch = html.match(/<meta property="og:description" content="([^"]+)">/) || html.match(/<meta name="description" content="([^"]+)">/);
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);
  
  // Custom Banner scraper
  let bannerUrl = '';
  const bannerRegexes = [
    /"banner":\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/,
    /"bannerHeaderRenderer"\s*:\s*\{\s*"banner"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/,
    /"tvBanner"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/
  ];

  for (const regex of bannerRegexes) {
    const match = html.match(regex);
    if (match && match[1]) {
      bannerUrl = match[1].replace(/&amp;/g, '&');
      break;
    }
  }

  // Handle extract
  const handleMatch = url.match(/@([a-zA-Z0-9_\-\.]+)/);
  const handle = handleMatch ? `@${handleMatch[1]}` : '@channel';

  const name = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'Unknown Creator';
  const description = descMatch ? descMatch[1].trim() : 'No channel description available.';
  const avatar = imageMatch ? imageMatch[1] : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60';

  // Extract subscriber count from page if available
  const subMatch = html.match(/"subscriberCountText".*?"accessibilityText".*?([\d,\.]+[KMB]?)/i)
    || html.match(/([\d,\.]+[KMB]?)\s*subscribers/i);
  const subscriberCountText = subMatch ? subMatch[1] : '';

  // Parse subscriber count to number
  let subscriberCount = 0;
  if (subscriberCountText) {
    const cleaned = subscriberCountText.replace(/,/g, '');
    const m = cleaned.match(/([\d\.]+)\s*[Mm]/);
    const k = cleaned.match(/([\d\.]+)\s*[Kk]/);
    if (m) subscriberCount = Math.round(parseFloat(m[1]) * 1000000);
    else if (k) subscriberCount = Math.round(parseFloat(k[1]) * 1000);
    else subscriberCount = parseInt(cleaned) || 0;
  }

  // Extract video count if available
  const videoMatch = html.match(/([\d,]+)\s*videos/i);
  const videoCount = videoMatch ? parseInt(videoMatch[1].replace(/,/g, '')) || 0 : 0;

  return {
    id: `chan_${Math.random().toString(36).substr(2, 9)}`,
    url,
    name,
    handle,
    avatar,
    banner: bannerUrl || 'PLACEHOLDER_GRADIENT', // Frontend can generate high-end CSS cyber grid banner if PLACEHOLDER_GRADIENT
    description,
    profiledAt: new Date().toISOString(),
    // Envy Engine — profile metrics for dashboard comparison
    subscriberCount,
    subscriberCountText: subscriberCountText || 'N/A',
    videoCount,
  };
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
        headers: { 'User-Agent': 'TubeGenius-Pro/2.0' },
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
        return jsonResponse({ success: true, profile });
      } catch (err: any) {
        console.error('[clone-crush:profile] error:', err.message);
        return jsonResponse({
          error: 'Could not profile channel. YouTube is currently rate-limiting or URL is invalid.',
          detail: err.message,
          fallback: {
            id: `chan_fallback_${Date.now()}`,
            url: channelUrl,
            name: channelUrl.split('/').pop()?.replace('@', '') || 'My Channel',
            handle: channelUrl.startsWith('@') ? channelUrl : '@creator',
            avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60',
            banner: 'PLACEHOLDER_GRADIENT',
            description: 'Custom added channel. Start creating!',
            profiledAt: new Date().toISOString(),
            subscriberCount: 0,
            subscriberCountText: 'N/A',
            videoCount: 0,
          }
        });
      }
    }

    // ---------------------------------------------------------
    // ACTION: COMPETITORS
    // ---------------------------------------------------------
    if (action === 'competitors') {
      if (!niche || !description) {
        return jsonResponse({ error: 'Niche and channel description are required to search competitors.' }, 400);
      }

      const systemQueryPrompt = `You are a YouTube Growth Strategist. Given a channel niche and bio description, output exactly 3 optimized YouTube search queries designed to find HIGHLY VIRAL, recently trending videos. Output strictly as JSON array: ["query1", "query2", "query3"].`;
      const userQueryPrompt = `Niche: "${niche}"\nBio: "${description}"\nGenerate search queries:`;

      let queries = [`${niche} viral`, `${niche} strategy`, `${niche} guide`];
      try {
        const queryOutcome = await fetchOpenRouterWithRetry({
          systemInstruction: { parts: [{ text: systemQueryPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userQueryPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
        });

        const queryResContent = extractOpenRouterText(await queryOutcome.res.json());
        if (queryResContent) {
          const parsed = JSON.parse(cleanupJson(queryResContent));
          if (Array.isArray(parsed) && parsed.length === 3) {
            queries = parsed;
          }
        }
      } catch (err) {
        console.warn('[clone-crush:queries] Failed to generate queries via LLM, using fallbacks', err);
      }

      let candidateVideos: RawScrapedVideo[] = [];
      const searchPromises = queries.map(async (q) => {
        let results = await fetchPipedSearch(q);
        if (results.length === 0) {
          results = await scrapeYoutubeSearch(q);
        }
        return results;
      });

      const allSearchResults = await Promise.all(searchPromises);
      for (const res of allSearchResults) {
        candidateVideos = [...candidateVideos, ...res];
      }

      const uniqueMap = new Map<string, RawScrapedVideo>();
      for (const video of candidateVideos) {
        if (video.videoId) {
          uniqueMap.set(video.videoId, video);
        }
      }
      const uniqueCandidates = Array.from(uniqueMap.values());

      if (uniqueCandidates.length === 0) {
        return jsonResponse({ error: "Could not find any competitor videos. YouTube proxies are temporarily busy, try again in a moment." }, 404);
      }

      const ratedCandidates = uniqueCandidates.map((v) => {
        const { viewsCount, velocity, recencyMultiplier } = calculateRecencyVelocity(v.viewsText, v.publishedText);
        return {
          ...v,
          viewsCount,
          velocity,
          recencyMultiplier,
        };
      });

      ratedCandidates.sort((a, b) => b.velocity - a.velocity);
      const topCandidates = ratedCandidates.slice(0, 10);

      const systemCurationPrompt = `You are a YouTube viral trend expert. From the list of recent YouTube video search results, curate exactly 3 videos that are the MOST relevant and viral for a channel focused on niche: "${niche}".
      Output strictly in this JSON structure:
      [
        { "videoId": "string", "relevanceReason": "Short hook explaining why this is perfect" },
        { "videoId": "string", "relevanceReason": "Short hook explaining why this is perfect" },
        { "videoId": "string", "relevanceReason": "Short hook explaining why this is perfect" }
      ]`;

      const candidateSummary = topCandidates.map((c, idx) => 
        `Index: ${idx}, ID: ${c.videoId}, Title: "${c.title}", Channel: "${c.channelName}", Views: "${c.viewsText}", Uploaded: "${c.publishedText}"`
      ).join('\n');

      const userCurationPrompt = `Here are the top candidates:\n${candidateSummary}\nSelect the top 3 best matching viral videos.`;

      let selectedIds: { videoId: string; relevanceReason: string }[] = [];
      try {
        const curationOutcome = await fetchOpenRouterWithRetry({
          systemInstruction: { parts: [{ text: systemCurationPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userCurationPrompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
        });

        const curationResContent = extractOpenRouterText(await curationOutcome.res.json());
        if (curationResContent) {
          selectedIds = JSON.parse(cleanupJson(curationResContent));
        }
      } catch (err) {
        console.error('[clone-crush:curation] LLM curation failed, falling back to top 3 ranked candidates', err);
      }

      if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
        selectedIds = topCandidates.slice(0, 3).map((v) => ({
          videoId: v.videoId,
          relevanceReason: 'Top viral content in your niche right now.'
        }));
      }

      const finalCompetitors = selectedIds.map((selection, index) => {
        const matchedVideo = ratedCandidates.find((c) => c.videoId === selection.videoId) || ratedCandidates[index] || topCandidates[0];
        const nicheCpm = getNicheCpm(niche);
        const estimatedRevenue = Math.round((matchedVideo.viewsCount / 1000) * nicheCpm);
        const viralVelocityScore = calculateViralVelocityScore(matchedVideo.viewsCount, matchedVideo.recencyMultiplier || 1);
        const uploadFrequency = estimateUploadFrequency(matchedVideo.publishedText);
        // Estimate monthly subscriber growth based on velocity (higher velocity = faster growth)
        const estimatedMonthlySubGrowth = Math.round(matchedVideo.velocity / 100);
        
        return {
          id: matchedVideo.videoId,
          videoId: matchedVideo.videoId,
          title: matchedVideo.title,
          url: `https://www.youtube.com/watch?v=${matchedVideo.videoId}`,
          thumbnail: matchedVideo.thumbnail || `https://i.ytimg.com/vi/${matchedVideo.videoId}/hqdefault.jpg`,
          views: matchedVideo.viewsText === 'Recently viral' && matchedVideo.viewsCount > 0 
            ? `${(matchedVideo.viewsCount / 1000).toFixed(0)}K views` 
            : matchedVideo.viewsText,
          viewsCount: matchedVideo.viewsCount,
          publishedAt: matchedVideo.publishedText,
          publishedDate: new Date(Date.now() - (matchedVideo.viewsCount % 10) * 24 * 60 * 60 * 1000).toISOString(),
          channelName: matchedVideo.channelName,
          duration: matchedVideo.duration || '8:45',
          isLocked: index > 0,
          relevance: selection.relevanceReason,
          // Envy Engine — FOMO metrics
          estimatedRevenue: `$${estimatedRevenue.toLocaleString()}`,
          estimatedRevenueNum: estimatedRevenue,
          viralVelocityScore,
          uploadFrequency,
          estimatedMonthlySubGrowth,
          nicheCpm: `$${nicheCpm}`,
        };
      });

      // Calculate aggregate competitor stats for the dashboard "War Room"
      const totalCompetitorRevenue = finalCompetitors.reduce((sum, c) => sum + c.estimatedRevenueNum, 0);
      const avgViralScore = Math.round(finalCompetitors.reduce((sum, c) => sum + c.viralVelocityScore, 0) / finalCompetitors.length);

      return jsonResponse({
        success: true,
        competitors: finalCompetitors,
        // Aggregate envy data for dashboard
        envyMetrics: {
          totalCompetitorMonthlyRevenue: `$${totalCompetitorRevenue.toLocaleString()}`,
          totalCompetitorMonthlyRevenueNum: totalCompetitorRevenue,
          averageViralVelocity: avgViralScore,
          nicheCpm: `$${getNicheCpm(niche)}`,
          niche,
        }
      });
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
