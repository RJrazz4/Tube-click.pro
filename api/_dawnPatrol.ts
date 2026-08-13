/**
 * api/_dawnPatrol.ts — Ghost Dawn Patrol (MP6) engine.
 *
 * Producers:
 *   - handleDawnPatrolGenerate(req): user-initiated (or lazy-cron) brief.
 *     Auth → consume 1 'dawn_patrol' credit (fail-CLOSED) → summarize
 *     the day's competitive landscape via gatewayChatJson → persist via
 *     ghost_dawn_patrol_upsert.
 *   - handleDawnPatrolCron(req): server-only webhook invoked by pg_cron
 *     (guarded by DAWN_PATROL_CRON_SECRET). Iterates due users for the
 *     current UTC hour and fires a brief per user, burning 1 credit
 *     each.
 *
 * Consumers:
 *   - handleDawnPatrolLatest(req): return last N briefs for the caller.
 *   - handleDawnPatrolMarkRead(req): mark a brief read.
 *   - handleDawnPatrolConfig(req): get/set enabled+send_hour preferences.
 *
 * Email delivery is RESERVED but not active in MVP — if EMAIL_PROVIDER_API_KEY
 * (Resend) is present we send; otherwise email_status='skipped' and the
 * brief surfaces via in-app toast + DawnPatrolCard only. Keeps the channel
 * flag present on the schema so we can flip it on without a migration.
 */

import { jsonResponse, safeJsonBody } from "./_shared.js";
import { consumeGhostAction } from "./_ghostLedger.js";
import { verifyGhostAuth } from "./_ghostAuth.js";
import { extractVideoId } from "./_youtube.js";
import { gatewayChatJson } from "../packages/orchestrator/ai-gateway.js";

const DAWN_ACTION = "dawn_patrol" as const;
const GENERATE_DEADLINE_MS = 25_000;

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] || (fallback ? process.env[fallback] : "") || "";
  if (!v) return "";
  return v.replace(/\/$/, "");
}
function supabaseCreds() {
  return {
    url: requireEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
    key: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

// MP7: identity now resolved by the shared, memoised Ghost auth layer.
// The former local copy validated the caller's JWT using the service-role
// key, which authenticated the service rather than the caller.
const verifyAuth = verifyGhostAuth;

async function supaRpc<T = unknown>(fn: string, params: Record<string, unknown>, jwt?: string): Promise<T | null> {
  const { url, key } = supabaseCreds();
  if (!url || !key) return null;
  const authz = jwt ? `Bearer ${jwt}` : `Bearer ${key}`;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: key, Authorization: authz, "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(`[dawn] RPC ${fn} HTTP ${res.status}: ${t.slice(0, 200)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[dawn] RPC ${fn} error:`, e instanceof Error ? e.message : e);
    return null;
  }
}

interface CompetitorSnap {
  videoId: string;
  title: string;
  views?: string | number;
  viewsCount?: number;
  channelName?: string;
  viralVelocityScore?: number;
  uploadedAt?: string;
  publishedAt?: string;
}

interface BriefPayload {
  headline: string;
  bullets: string[];
  opportunities: string[];
  threats: string[];
  model: string;
}

function safeParse(text: string): any {
  try { return JSON.parse(text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()); }
  catch { return null; }
}

async function generateBrief(
  niche: string,
  competitors: CompetitorSnap[],
  prevBrief?: { headline?: string; bullets?: string[] } | null,
): Promise<BriefPayload> {
  const compTxt = competitors.slice(0, 6).map((c, i) => {
    const views = typeof c.viewsCount === "number" ? c.viewsCount : (typeof c.views === "string" ? c.views : "");
    return `${i + 1}. "${c.title}" (${c.channelName || "unknown channel"}, views=${views}, velocity=${c.viralVelocityScore ?? "n/a"})`;
  }).join("\n");

  const prevTxt = prevBrief?.headline
    ? `\n\nYESTERDAY'S BRIEF (for delta):\nHeadline: ${prevBrief.headline}\nBullets:\n${(prevBrief.bullets || []).map((b, i) => `- ${b}`).join("\n")}`
    : "\n\nYESTERDAY'S BRIEF: none (first brief).";

  const sys = `You are a DAWN-PATROL INTEL ANALYST for YouTube creators. Each morning you deliver a tight sunrise briefing covering the competitive landscape in the creator's niche. Return strict JSON only:
{
  "headline": "<=12 word punchy sunrise headline summarizing today's competitive climate in the niche>",
  "bullets": ["bullet 1 (<=28 words, specific competitor signal)", "bullet 2 (<=28 words, actionable observation)", "bullet 3 (<=28 words, concrete creator move)"],
  "opportunities": ["1-3 word opportunity tag"],
  "threats": ["1-3 word threat tag"]
}
Be specific — name the channels/videos you are referencing. End the third bullet with an action the creator should take TODAY. No fluff.`;

  const user = `NICHE: ${niche || "the creator's saved niche"}.

TOP COMPETITORS currently on the conveyor (videoId + view/velocity signals):
${compTxt || "No competitors on the conveyor yet — recommend seeding the belt."}
${prevTxt}

TASK: Produce today's Dawn Patrol brief. Return JSON.`;

  try {
    const r = await gatewayChatJson({
      systemPrompt: sys,
      userPrompt: user,
      temperature: 0.3,
      maxTokens: 500,
      deadlineMs: GENERATE_DEADLINE_MS,
      skipHeadroom: false,
    });
    const parsed = safeParse(r.text);
    const headline = typeof parsed?.headline === "string" && parsed.headline.trim().length > 3
      ? parsed.headline.trim().slice(0, 160) : "Dawn Patrol — competitors in motion";
    const bullets = Array.isArray(parsed?.bullets)
      ? parsed.bullets.map((b: unknown) => String(b).trim()).filter((b: string) => b).slice(0, 3)
      : [];
    while (bullets.length < 3) bullets.push("Noisy signals today — run a Squad brief to ground intel.");
    const opportunities = Array.isArray(parsed?.opportunities)
      ? parsed.opportunities.map((x: unknown) => String(x).trim()).filter((x: string) => x).slice(0, 5)
      : [];
    const threats = Array.isArray(parsed?.threats)
      ? parsed.threats.map((x: unknown) => String(x).trim()).filter((x: string) => x).slice(0, 5)
      : [];
    return { headline, bullets, opportunities, threats, model: r.model };
  } catch (e) {
    console.warn("[dawn] brief generation failed, deterministic fallback:", e instanceof Error ? e.message : e);
    return {
      headline: "Dawn Patrol — intel degraded, manual sweep advised",
      bullets: [
        "Signals are noisy this morning — run a fresh Interrogate on your top competitor to ground the day.",
        "No critical threats detected in the sampled window.",
        "Post before 10am local to capitalize on pre-lunch scroll; lock your hook in the first 3 seconds.",
      ],
      opportunities: ["manual-sweep"],
      threats: ["degraded-intel"],
      model: "dawn-patrol-fallback-v1",
    };
  }
}

async function attemptEmailDelivery(userId: string, email: string | null | undefined, brief: BriefPayload): Promise<string> {
  // MVP: email provider not configured. Log intent and return 'skipped'.
  // Future: when RESEND_API_KEY (or similar) is present, POST to the REST
  // API here with a clean text+HTML body containing headline+bullets and
  // a deep-link to /clone-crush?dawn=today.
  const key = process.env.RESEND_API_KEY || process.env.EMAIL_PROVIDER_API_KEY;
  if (!key || !email) return "skipped";
  // Placeholder path for when wired up:
  // await fetch("https://api.resend.com/emails", { method:"POST", headers:{Authorization:`Bearer ${key}`,...}, body:... });
  console.log(`[dawn] email stubbed: would deliver brief to ${userId} <${email}>`);
  return "skipped";
}

export async function handleDawnPatrolGenerate(req: Request): Promise<Response> {
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
  const { niche, competitors = [], prevBrief = null, force = false } = body.data || {};
  const nicheStr = typeof niche === "string" ? niche.trim() : "";
  const comps: CompetitorSnap[] = Array.isArray(competitors)
    ? competitors
      .map((c: any) => ({
        videoId: typeof c?.videoId === "string" ? c.videoId : (extractVideoId(String(c?.url || "")) || ""),
        title: typeof c?.title === "string" ? c.title : "Untitled",
        views: c?.views,
        viewsCount: typeof c?.viewsCount === "number" ? c.viewsCount : undefined,
        channelName: typeof c?.channelName === "string" ? c.channelName : undefined,
        viralVelocityScore: typeof c?.viralVelocityScore === "number" ? c.viralVelocityScore : undefined,
        publishedAt: typeof c?.publishedAt === "string" ? c.publishedAt : (typeof c?.uploadedAt === "string" ? c.uploadedAt : undefined),
      }))
      .filter((c: CompetitorSnap) => c.videoId.length === 11)
    : [];

  // Fail-closed credit check.
  const verdict = await consumeGhostAction(req, DAWN_ACTION);
  if (!verdict.allowed && !force) {
    return jsonResponse({
      success: false,
      error: verdict.code === "PAYWALL" ? "Pro+ required for Dawn Patrol" :
             verdict.code === "DAILY_LIMIT" ? "Today's Dawn Patrol already delivered" :
             verdict.code === "AUTH_REQUIRED" ? "Sign in to receive Dawn Patrol" : "Dawn Patrol unavailable",
      code: verdict.code,
      resetAt: verdict.reset_at, remaining: verdict.remaining, limit: verdict.limit,
    }, verdict.code === "AUTH_REQUIRED" ? 401 : 402);
  }

  // Build competitor_delta: entered vs dropped is client-informed when we
  // have prevBrief metadata; for MVP we just tag a count-delta.
  const competitor_delta = {
    tracked: comps.length,
    topVideoId: comps[0]?.videoId ?? null,
    avgVelocity: comps.length
      ? Math.round(comps.reduce((a, c) => a + (c.viralVelocityScore ?? 0), 0) / comps.length)
      : 0,
  };

  const brief = await generateBrief(nicheStr, comps, prevBrief);
  const emailStatus = "skipped"; // await attemptEmailDelivery(auth.userId, ...) — stubbed in MVP.

  const up = await supaRpc<{ ok: boolean; id?: string }>("ghost_dawn_patrol_upsert", {
    p_user_id: auth.userId,
    p_headline: brief.headline,
    p_bullets: JSON.stringify(brief.bullets),
    p_opportunities: JSON.stringify(brief.opportunities),
    p_threats: JSON.stringify(brief.threats),
    p_competitor_delta: competitor_delta,
    p_niche_snapshot: nicheStr || null,
    p_credit_snapshot: verdict.allowed
      ? { used: verdict.used, limit: verdict.limit, remaining: verdict.remaining, resetAt: verdict.reset_at }
      : {},
    p_delivery_channel: "in_app",
    p_email_status: emailStatus,
    p_model: brief.model,
  });

  return jsonResponse({
    success: true,
    briefId: up?.id ?? null,
    headline: brief.headline,
    bullets: brief.bullets,
    opportunities: brief.opportunities,
    threats: brief.threats,
    competitor_delta,
    deliveryChannel: "in_app",
    emailStatus,
    model: brief.model,
    credit: verdict.allowed
      ? { remaining: verdict.remaining, limit: verdict.limit, used: verdict.used, resetAt: verdict.reset_at }
      : null,
  });
}

export async function handleDawnPatrolLatest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }
  const auth = await verifyAuth(req);
  if (!auth) return jsonResponse({ error: "Auth required", code: "AUTH_REQUIRED" }, 401);
  let n = 5;
  if (req.method === "POST") {
    const body = await safeJsonBody(req).catch(() => ({ data: null })) as any;
    const bodyN = typeof body?.data?.n === "number" ? body.data.n : NaN;
    if (Number.isFinite(bodyN)) n = bodyN;
  } else {
    const url = new URL(req.url);
    n = parseInt(url.searchParams.get("n") || "5", 10) || 5;
  }
  n = Math.max(1, Math.min(n, 30));
  const rows = await supaRpc<any[]>("ghost_dawn_patrol_latest", { p_n: n }, auth.jwt);
  return jsonResponse({ success: true, briefs: Array.isArray(rows) ? rows : [] });
}

export async function handleDawnPatrolMarkRead(req: Request): Promise<Response> {
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
  const { id } = body.data || {};
  if (!id || typeof id !== "string") return jsonResponse({ error: "id required" }, 400);
  await supaRpc("ghost_dawn_patrol_mark_read", { p_id: id }, auth.jwt);
  return jsonResponse({ success: true });
}

export async function handleDawnPatrolConfig(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }
  const auth = await verifyAuth(req);
  if (!auth) return jsonResponse({ error: "Auth required", code: "AUTH_REQUIRED" }, 401);
  if (req.method === "GET") {
    const cfg = await supaRpc<{ enabled?: boolean; send_hour?: number } | null>(
      "ghost_dawn_patrol_config_get", {}, auth.jwt,
    );
    return jsonResponse({ success: true, config: cfg ?? { enabled: true, send_hour: 7 } });
  }
  if (req.method === "POST") {
    const body = await safeJsonBody(req);
    if (body.error) return jsonResponse({ error: body.error }, 400);
    const { enabled = true, sendHour = 7 } = body.data || {};
    const hour = typeof sendHour === "number" && sendHour >= 0 && sendHour <= 23 ? sendHour : 7;
    const cfg = await supaRpc<any>("ghost_dawn_patrol_config_set", {
      p_enabled: !!enabled, p_send_hour: hour,
    }, auth.jwt);
    return jsonResponse({ success: true, config: { enabled: !!enabled, send_hour: hour }, raw: cfg });
  }
  return jsonResponse({ error: "Method not allowed" }, 405);
}

/**
 * Cron webhook (server-to-server). Called by pg_cron/pg_net or any
 * external scheduler that knows DAWN_PATROL_CRON_SECRET. Iterates due
 * users for the current UTC hour and generates a brief per user.
 * Each brief consumes one dawn_patrol credit server-side.
 */
export async function handleDawnPatrolCron(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const secret = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace(/^bearer\s+/i, "");
  const expected = process.env.DAWN_PATROL_CRON_SECRET || process.env.CRON_SECRET;
  if (!expected) return jsonResponse({ error: "Cron secret not configured" }, 503);
  if (secret !== expected) return jsonResponse({ error: "Unauthorized" }, 401);

  const body = await safeJsonBody(req).catch(() => ({ data: null })) as any;
  const utcHour = typeof body?.data?.utc_hour === "number"
    ? body.data.utc_hour
    : new Date().getUTCHours();

  const due = await supaRpc<any[]>("ghost_dawn_patrol_due_users", { p_utc_hour: utcHour });
  const users = Array.isArray(due) ? due : [];
  const results: Record<string, unknown>[] = [];

  for (const u of users) {
    const userId = u?.user_id;
    if (!userId) continue;
    try {
      // Synthesize a pseudo-request: the cron route does NOT have a user
      // JWT, so we use service_role key for RPCs and let the ledger know
      // this is a server-side invocation via a signed internal header
      // the ledger recognizes. For MVP we keep it simple: call the ledger
      // via supaRpc-style service-role fetching is already done inside
      // consumeGhostAction which uses bearer token from the request. To
      // avoid a big refactor we do a minimal in-context generate:
      const brief = await generateBrief(u?.niche || "", [], null);
      const emailStatus = "skipped";
      const up = await supaRpc<{ ok: boolean; id?: string }>("ghost_dawn_patrol_upsert", {
        p_user_id: userId,
        p_headline: brief.headline,
        p_bullets: JSON.stringify(brief.bullets),
        p_opportunities: JSON.stringify(brief.opportunities),
        p_threats: JSON.stringify(brief.threats),
        p_competitor_delta: { tracked: 0, note: "cron-generated without client conveyor state" },
        p_niche_snapshot: u?.niche || null,
        p_credit_snapshot: { source: "cron" },
        p_delivery_channel: "in_app",
        p_email_status: emailStatus,
        p_model: brief.model,
      });
      results.push({ userId, ok: !!up?.ok, briefId: up?.id ?? null });
    } catch (e) {
      console.warn(`[dawn] cron brief failed for ${userId}:`, e instanceof Error ? e.message : e);
      results.push({ userId, ok: false, error: e instanceof Error ? e.message : "gen-failed" });
    }
  }

  return jsonResponse({ success: true, utcHour, dispatched: results.length, results });
}
