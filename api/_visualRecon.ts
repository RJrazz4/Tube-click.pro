/**
 * api/_visualRecon.ts — Ghost Visual Recon (MP5) engine.
 *
 * BLACK-OPS LANE feature: samples ~8-12 evenly-spaced moments from a
 * competitor video using YouTube's public thumbnail ladder (no ffmpeg,
 * no streaming-MP4 download — Edge-runtime compatible), captions each
 * frame with multimodal Gemini Flash through the Vercel AI Gateway,
 * embeds captions with text-embedding-3-small (same embedder as MP3
 * Interrogate), and persists frames to `ghost_recon_frames`. Text
 * queries embed -> cosine top-K over caption vectors.
 *
 * Two public handlers, mirrored after the interrogate pattern:
 *   - handleReconIngest(req) → POST /api/ghost/recon-ingest
 *   - handleReconSearch(req) → POST /api/ghost/recon-search
 *
 * Credit cost: 1 'recon' credit per video ingest. Searches are free
 * (token cost is negligible once frames are embedded).
 */

import { jsonResponse, safeJsonBody } from "./_shared.js";
import { consumeGhostAction } from "./_ghostLedger.js";
import { extractVideoId } from "./_youtube.js";
import { gatewayChatJson } from "../packages/orchestrator/ai-gateway.js";
import { embedTexts } from "../packages/orchestrator/embeddings.js";

const RECON_ACTION = "recon" as const;
const MAX_FRAMES = 12;
const CAPTION_DEADLINE_MS = 20_000;

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] || (fallback ? process.env[fallback] : "") || "";
  if (!v) throw new Error(`${name} not configured`);
  return v.replace(/\/$/, "");
}
function supabaseCreds() {
  return {
    url: requireEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
    key: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}
async function verifyAuth(req: Request): Promise<{ userId: string; jwt: string } | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const token = auth.slice("bearer ".length).trim();
  if (!token) return null;
  const { url, key } = supabaseCreds();
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { id?: string };
    return u?.id ? { userId: u.id, jwt: token } : null;
  } catch { return null; }
}
async function supaRpc<T = unknown>(fn: string, params: Record<string, unknown>): Promise<T | null> {
  const { url, key } = supabaseCreds();
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(`[recon] RPC ${fn} HTTP ${res.status}: ${t.slice(0,200)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[recon] RPC ${fn} error:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Build a list of thumbnail sampling URLs from YouTube's public
 * thumbnail ladder. We intentionally use the non-signed i.ytimg.com
 * endpoints — these serve a sparse, evenly-spaced time-slice of the
 * video (~0, 10, 25, 50, 75, 90% on the `hq720/1..3.jpg` ladder, plus
 * 0/1/2/3.jpg for finer early-moment sampling).
 *
 * All URLs are https://i.ytimg.com/vi/<id>/...jpg. They don't need
 * signatures and are cacheable globally. For multimodal captioning we
 * feed the URLs themselves to the model (gateway fetches via the
 * image URL feature on Gemini Flash) — this avoids base64 inflating
 * our request size.
 */
export function buildSampleFrames(videoId: string, durationSec?: number): Array<{ frameIdx: number; tsSeconds: number; thumbUrl: string; label: string }> {
  // Deterministic 12-frame ladder covering the video's arc.
  // hqdefault.jpg = ~20s mark (auto-chosen by YouTube for thumb).
  // 0..3 = quarters (YouTube's auto-generated thumbs ~beginning/mid/end).
  // hq720.jpg = highest-res hero thumb (typically ~0:15).
  // We add sddefault, mqdefault, maxresdefault variants for variety; they
  // all resolve when available and fall back to hqdefault otherwise.
  const samples: Array<{ frameIdx: number; thumbName: string; label: string; tsGuess: number }> = [
    { frameIdx: 0, thumbName: "hqdefault.jpg", label: "opening / hero thumb", tsGuess: 5 },
    { frameIdx: 1, thumbName: "hq1.jpg",       label: "1/4 mark",          tsGuess: 20 },
    { frameIdx: 2, thumbName: "hq2.jpg",       label: "mid roll",         tsGuess: 40 },
    { frameIdx: 3, thumbName: "hq3.jpg",       label: "3/4 mark",         tsGuess: 70 },
    { frameIdx: 4, thumbName: "0.jpg",         label: "very opening",     tsGuess: 1 },
    { frameIdx: 5, thumbName: "1.jpg",         label: "~25%",             tsGuess: 25 },
    { frameIdx: 6, thumbName: "2.jpg",         label: "~50%",             tsGuess: 50 },
    { frameIdx: 7, thumbName: "3.jpg",         label: "~75%",             tsGuess: 75 },
    { frameIdx: 8, thumbName: "mqdefault.jpg", label: "hero mq",          tsGuess: 8 },
    { frameIdx: 9, thumbName: "sddefault.jpg", label: "hero sd",          tsGuess: 10 },
    { frameIdx: 10, thumbName: "hq720.jpg",    label: "720p hero",        tsGuess: 12 },
    { frameIdx: 11, thumbName: "maxresdefault.jpg", label: "maxres hero", tsGuess: 15 },
  ];
  const dur = (typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0) ? durationSec : 90;
  // Re-scale tsGuess against the reported duration (cap at dur-2 so we
  // never claim a timestamp beyond end of video).
  const scale = Math.max(30, Math.min(dur - 2, 90)) / 90;
  return samples.slice(0, MAX_FRAMES).map((s) => ({
    frameIdx: s.frameIdx,
    tsSeconds: Math.max(0, Math.min(Math.round(s.tsGuess * scale * (dur / 90)), Math.max(0, dur - 2))),
    thumbUrl: `https://i.ytimg.com/vi/${videoId}/${s.thumbName}`,
    label: s.label,
  }));
}

async function fetchPipedStreamsMeta(videoId: string): Promise<{ duration?: number; title?: string }> {
  const nodes = [
    "https://api.piped.private.coffee",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.colby.rocks",
    "https://pipedapi.mha.fi",
    "https://pipedapi.syncpnd.com",
    "https://api.piped.projectsegfau.lt",
  ];
  const timeout = AbortSignal.timeout(3_500);
  const jobs = nodes.map(async (base) => {
    const res = await fetch(`${base}/streams/${videoId}`, {
      headers: { "User-Agent": "TubeClickPro/2.0 VisualRecon" },
      signal: timeout,
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j) return null;
    const dur = typeof j.duration === "number" ? j.duration : undefined;
    const title = typeof j.title === "string" ? j.title : undefined;
    return { duration: dur, title };
  });
  try {
    return await Promise.any(jobs);
  } catch {
    return {};
  }
}

interface CaptionedFrame {
  frameIdx: number;
  tsSeconds: number;
  thumbUrl: string;
  caption: string;
  visualTags: string[];
  model: string;
}

async function captionFrame(videoId: string, title: string, frame: { frameIdx: number; tsSeconds: number; thumbUrl: string; label: string }): Promise<CaptionedFrame | null> {
  const sys = `You are a VISUAL INTEL ANALYST for YouTube thumbnail reverse-engineering. Given ONE frame image from a competitor's video at a known timestamp, produce a concise forensic caption useful for text-based visual search.
Return strict JSON only:
{
  "caption": "1-2 sentence description of what is visually shown (faces, text overlays, arrows/circles, background, facial expression, color, on-screen graphics)",
  "visualTags": ["...3 to 6 short tags — hooks, arrows, emotions, text style, composition, color palette"]
}
Speak concretely: describe specific colors, words you see, face expression, zoom, graphics. No fluff.`;
  const user = `VIDEO: "${title}" (id=${videoId})
FRAME CONTEXT: timestamp ~${Math.round(frame.tsSeconds)}s, position: ${frame.label}
TASK: Describe this exact frame so a creator can search for it by text. Return JSON.`;
  try {
    const r = await gatewayChatJson({
      systemPrompt: sys,
      userPrompt: user,
      temperature: 0.2,
      maxTokens: 400,
      deadlineMs: CAPTION_DEADLINE_MS,
      images: [{ url: frame.thumbUrl, mimeType: "image/jpeg", detail: "high" }],
      skipHeadroom: true,
    });
    const parsed = safeParse(r.text);
    if (!parsed || typeof parsed !== "object") throw new Error("bad caption shape");
    const caption = typeof parsed.caption === "string" && parsed.caption.trim().length > 8 ? parsed.caption.trim() : "";
    const tags = Array.isArray(parsed.visualTags)
      ? parsed.visualTags.map((t: unknown) => String(t).trim()).filter((t) => t).slice(0, 8)
      : [];
    if (!caption) throw new Error("empty caption");
    return {
      frameIdx: frame.frameIdx,
      tsSeconds: frame.tsSeconds,
      thumbUrl: frame.thumbUrl,
      caption,
      visualTags: tags,
      model: r.model,
    };
  } catch (e) {
    console.warn(`[recon] caption failed for frame ${frame.frameIdx}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

function safeParse(text: string): any {
  try { return JSON.parse(text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()); }
  catch { return null; }
}

async function countExisting(userId: string, videoId: string): Promise<{ count: number; ready: boolean }> {
  const v = await supaRpc<{ count?: number; ready?: boolean } | null>("ghost_recon_count", { p_user_id: userId, p_video_id: videoId });
  return { count: v?.count ?? 0, ready: v?.ready === true };
}

export async function handleReconIngest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const auth = await verifyAuth(req);
  if (!auth) return jsonResponse({ error: "Auth required", code: "AUTH_REQUIRED" }, 401);
  const body = await safeJsonBody(req);
  if (body.error) return jsonResponse({ error: body.error }, 400);
  const { video, slotId = 0 } = body.data || {};
  const rawUrl = typeof video?.url === "string" ? video.url : (typeof video?.videoId === "string" ? video.videoId : "");
  const videoId = extractVideoId(rawUrl) || (typeof video?.videoId === "string" ? video.videoId : null);
  if (!videoId || videoId.length !== 11) return jsonResponse({ error: "Valid YouTube URL / videoId required" }, 400);
  const title = typeof video?.title === "string" ? video.title : `Competitor ${videoId}`;

  // Cache hit — return existing frame count without burning a credit.
  const existing = await countExisting(auth.userId, videoId);
  if (existing.ready && existing.count >= 4) {
    return jsonResponse({ success: true, videoId, framesIndexed: existing.count, cached: true });
  }

  // Consume 1 recon credit — FAIL-CLOSED.
  const verdict = await consumeGhostAction(req, RECON_ACTION);
  if (!verdict.allowed) {
    return jsonResponse({
      success: false,
      error: verdict.code === "PAYWALL" ? "Black-Ops clearance required for Visual Recon" :
             verdict.code === "DAILY_LIMIT" ? "Daily recon limit reached" :
             verdict.code === "AUTH_REQUIRED" ? "Sign in to use Visual Recon" : "Recon unavailable",
      code: verdict.code,
      resetAt: verdict.reset_at, remaining: verdict.remaining, limit: verdict.limit,
    }, verdict.code === "AUTH_REQUIRED" ? 401 : 402);
  }

  // Pull duration metadata from Piped (best-effort; default ~90s).
  const meta = await fetchPipedStreamsMeta(videoId).catch(() => ({ duration: undefined, title: undefined }));
  const videoDur = typeof (video as any)?.duration === "number" ? (video as any).duration : undefined;
  const duration = typeof videoDur === "number" ? videoDur : (typeof meta.duration === "number" ? meta.duration : undefined);
  const frames = buildSampleFrames(videoId, duration);

  // Caption frames in parallel (bounded concurrency via Promise.all — 12 is
  // acceptable for a black-ops-lane credit-burn; each call is ≤20s).
  const results = await Promise.all(
    frames.map((f) => captionFrame(videoId, title, f)),
  );
  const captioned = results.filter((r): r is CaptionedFrame => !!r);
  if (captioned.length === 0) {
    return jsonResponse({ success: false, error: "Visual intel unreachable — try again" }, 502);
  }

  // Embed captions in batch.
  let embeddings: number[][] = [];
  try {
    embeddings = await embedTexts(captioned.map((c) => c.caption));
  } catch (e) {
    console.warn("[recon] embedding failed, storing lexical-only frames:", e instanceof Error ? e.message : e);
    embeddings = captioned.map(() => []);
  }

  const payload = captioned.map((c, i) => ({
    frame_idx: c.frameIdx,
    ts_seconds: c.tsSeconds,
    thumb_url: c.thumbUrl,
    caption: c.caption,
    visual_tags: c.visualTags,
    embedding: embeddings[i]?.length === 1536 ? embeddings[i] : null,
    model: c.model,
  }));

  await supaRpc("ghost_recon_upsert_frames", {
    p_user_id: auth.userId,
    p_video_id: videoId,
    p_frames: payload,
  });

  return jsonResponse({
    success: true,
    videoId,
    framesIndexed: captioned.length,
    cached: false,
    slotId: typeof slotId === "number" ? slotId : 0,
    credit: { remaining: verdict.remaining, limit: verdict.limit, used: verdict.used, resetAt: verdict.reset_at },
  });
}

interface ReconFrameResult {
  frame_idx: number;
  ts_seconds: number;
  thumb_url: string;
  caption: string;
  visual_tags?: string[];
  similarity?: number;
}

export async function handleReconSearch(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const auth = await verifyAuth(req);
  if (!auth) return jsonResponse({ error: "Auth required", code: "AUTH_REQUIRED" }, 401);
  const body = await safeJsonBody(req);
  if (body.error) return jsonResponse({ error: body.error }, 400);
  const { videoId: rawVideoId, query } = body.data || {};
  const videoId = extractVideoId(String(rawVideoId || "")) || (typeof rawVideoId === "string" && rawVideoId.length === 11 ? rawVideoId : null);
  if (!videoId) return jsonResponse({ error: "videoId required" }, 400);
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return jsonResponse({ error: "query required" }, 400);
  }

  // Embed query.
  let qEmbed: number[];
  try {
    const mod = await import("../packages/orchestrator/embeddings.js");
    qEmbed = await mod.embedText(query.trim());
  } catch (e) {
    console.warn("[recon] query embed failed:", e);
    return jsonResponse({ error: "Embedding failed" }, 502);
  }

  const results = await supaRpc<ReconFrameResult[] | null>("ghost_recon_search", {
    p_user_id: auth.userId,
    p_video_id: videoId,
    p_embedding: qEmbed,
    p_k: 6,
  });
  if (!results) {
    return jsonResponse({ error: "Frames not indexed yet", code: "INDEX_REQUIRED" }, 428);
  }

  return jsonResponse({
    success: true,
    videoId,
    query: query.trim(),
    results: results.map((r) => ({
      frameIdx: r.frame_idx,
      tsSeconds: r.ts_seconds,
      thumbUrl: r.thumb_url,
      caption: r.caption,
      visualTags: r.visual_tags || [],
      similarity: typeof r.similarity === "number" ? r.similarity : 0,
      youtubeUrl: `https://youtu.be/${videoId}?t=${Math.max(0, r.ts_seconds)}`,
    })),
  });
}
