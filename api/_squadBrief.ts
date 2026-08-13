/**
 * api/_squadBrief.ts — Ghost Intel Squad edge-route engine.
 *
 * Responsibilities (server-authoritative):
 *   1. Verify bearer token + consume one squad credit (fail-CLOSED).
 *   2. Hit a short local cache (ghost_squad_briefs table) so repeat
 *      clicks on the same video don't re-burn credits.
 *   3. Pull transcript via the existing transcript edge handler.
 *   4. Pull top comments via Piped mesh (api/_youtube.ts).
 *   5. Run the 4-agent + Critic chain (api/_agenticEngine.ts).
 *   6. Persist the dossier, return payload.
 *
 * Edge-runtime friendly: zero Node-only deps, all fetches use
 * AbortSignal.timeout, and any failure falls through to a deterministic
 * fallback dossier returned from runSquadBrief itself.
 */

import { jsonResponse, safeJsonBody } from "./_shared.js";
import { consumeGhostAction } from "./_ghostLedger.js";
import { fetchTopComments, extractVideoId } from "./_youtube.js";
import { runSquadBrief, type ChannelMemoryProfile, type SquadBriefPayload } from "./_agenticEngine.js";

const SQUAD_ACTION = "squad" as const;

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
  } catch {
    return null;
  }
}

async function supaRpc<T = unknown>(fn: string, params: Record<string, unknown>): Promise<T | null> {
  const { url, key } = supabaseCreds();
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[squad] RPC ${fn} HTTP ${res.status}: ${body.slice(0,200)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[squad] RPC ${fn} error:`, e instanceof Error ? e.message : e);
    return null;
  }
}

async function fetchCachedBrief(userId: string, videoId: string): Promise<SquadBriefPayload | null> {
  const row = await supaRpc<{ payload?: any; model?: string; cost_tokens?: number; threat_level?: number; created_at?: string; slot_id?: number } | null>(
    "ghost_get_squad_brief",
    { p_user_id: userId, p_target_video_id: videoId },
  );
  if (!row || !row.payload || typeof row.payload !== "object") return null;
  // Payload is the original brief; return as-is.
  return row.payload as SquadBriefPayload;
}

async function persistBrief(userId: string, slotId: number, brief: SquadBriefPayload): Promise<void> {
  await supaRpc("ghost_upsert_squad_brief", {
    p_user_id: userId,
    p_slot_id: slotId,
    p_target_video_id: brief.videoId,
    p_payload: brief,
    p_model: brief.model,
    p_cost_tokens: 0, // token tracking is owned by the gateway logs; we can backfill.
    p_threat_level: brief.threatLevel,
  });
}

async function fetchTranscript(videoId: string): Promise<{ text: string; source: string; ghostReconstructed: boolean }> {
  try {
    const mod = await import("./transcript.js");
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.SELF_URL || "http://127.0.0.1:5173";
    const req = new Request(`${base}/api/transcript`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `https://youtu.be/${videoId}`, lang: "en" }),
    });
    const res = (await mod.default(req)) as Response;
    if (res.ok) {
      const json = (await res.json()) as { transcript?: string; source?: string; ghostReconstructed?: boolean };
      if (json.transcript && json.transcript.length > 40) {
        return { text: json.transcript, source: json.source || "unknown", ghostReconstructed: !!json.ghostReconstructed };
      }
    }
  } catch (e) {
    console.warn("[squad] transcript import failed:", e instanceof Error ? e.message : e);
  }
  // Deterministic transcript scaffold (same pattern as transcript.ts ghost-synthetic).
  return {
    text: `Ghost squad scaffold transcript for video ${videoId}: high-retention hook, pattern-interrupt opening, mid-roll demo/proof, CTA loop-bomb. Niche authority, monetization mentions likely around the 40-60s mark, end-screen subscribe CTA. Comments will demand specifics the script never delivers — exploitable gap.`,
    source: "ghost-synthetic",
    ghostReconstructed: true,
  };
}

export async function handleSquadBrief(req: Request): Promise<Response> {
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
  const { video, slotId = 0, savedNiche, channelMemory } = body.data || {};
  const rawUrl = typeof video?.url === "string" ? video.url : (typeof video?.videoId === "string" ? video.videoId : "");
  const videoId = extractVideoId(rawUrl) || (typeof video?.videoId === "string" ? video.videoId : null);
  if (!videoId || videoId.length !== 11) return jsonResponse({ error: "Valid YouTube video URL / videoId required" }, 400);

  const normalizedVideo = {
    videoId,
    title: String(video?.title || `Competitor ${videoId}`),
    url: `https://youtu.be/${videoId}`,
    channelName: String(video?.channelName || "Competitor Channel"),
    views: String(video?.views || video?.viewsText || "50,000 views"),
    viewsCount: typeof video?.viewsCount === "number" ? video.viewsCount : 0,
    viralVelocityScore: typeof video?.viralVelocityScore === "number" ? video.viralVelocityScore : 55,
    estimatedRevenue: typeof video?.estimatedRevenue === "string" ? video.estimatedRevenue : "$0",
    publishedAt: typeof video?.publishedAt === "string" ? video.publishedAt : new Date().toISOString(),
    thumbnail: typeof video?.thumbnail === "string" ? video.thumbnail : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
  const niche = typeof savedNiche === "string" && savedNiche.trim() ? savedNiche.trim() : "General YouTube Content";
  const mem: ChannelMemoryProfile = (channelMemory && typeof channelMemory === "object")
    ? {
        niche: typeof channelMemory.niche === "string" ? channelMemory.niche : niche,
        targetAudience: typeof channelMemory.targetAudience === "string" ? channelMemory.targetAudience : "Digital creators",
        preferredTone: typeof channelMemory.preferredTone === "string" ? channelMemory.preferredTone : "Cinematic & Authoritative",
        bannedPhrases: Array.isArray(channelMemory.bannedPhrases) ? channelMemory.bannedPhrases.filter((x): x is string => typeof x === "string") : [],
        pastSuccessNotes: typeof channelMemory.pastSuccessNotes === "string" ? channelMemory.pastSuccessNotes : "",
      }
    : { niche, targetAudience: "Digital creators", preferredTone: "Cinematic & Authoritative", bannedPhrases: [] };

  // Cache hit check BEFORE consuming credit (defensive: prevents re-burn
  // on double-click / retry).
  const cached = await fetchCachedBrief(auth.userId, videoId);
  if (cached) {
    return jsonResponse({ success: true, brief: cached, cached: true });
  }

  // Consume 1 squad credit — FAIL-CLOSED.
  const verdict = await consumeGhostAction(req, SQUAD_ACTION);
  if (!verdict.allowed) {
    return jsonResponse({
      success: false,
      error: verdict.code === "PAYWALL" ? "Pro plan required for Intel Squad" :
             verdict.code === "DAILY_LIMIT" ? "Daily squad limit reached" :
             verdict.code === "AUTH_REQUIRED" ? "Sign in to run Intel Squad" : "Squad unavailable",
      code: verdict.code,
      resetAt: verdict.reset_at,
      remaining: verdict.remaining,
      limit: verdict.limit,
    }, verdict.code === "AUTH_REQUIRED" ? 401 : 402);
  }

  // Parallel intel pull: transcript + comments.
  const [transcript, comments] = await Promise.all([
    fetchTranscript(videoId),
    fetchTopComments(videoId).catch(() => []),
  ]);

  const brief = await runSquadBrief({
    video: normalizedVideo,
    transcript,
    comments: Array.isArray(comments) ? comments : [],
    savedNiche: niche,
    channelMemory: mem,
  });

  // Persist fire-and-forget; do NOT fail the request if DB hiccups.
  void persistBrief(auth.userId, typeof slotId === "number" ? slotId : 0, brief).catch((e) => {
    console.warn("[squad] persist failed (non-fatal):", e instanceof Error ? e.message : e);
  });

  return jsonResponse({
    success: true,
    brief,
    cached: false,
    credit: {
      remaining: verdict.remaining,
      limit: verdict.limit,
      used: verdict.used,
      resetAt: verdict.reset_at,
    },
  });
}
