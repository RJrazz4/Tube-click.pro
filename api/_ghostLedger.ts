/**
 * api/_ghostLedger.ts — server-side helpers for the Ghost Intelligence
 * credit ledger.
 *
 * Thin wrappers over the SECURITY DEFINER RPCs defined in
 * supabase/migrations/202608140001_ghost_intel_ledger.sql.
 *
 * All tier checks and quota bookkeeping are server-authoritative. The
 * client may read its own snapshot (getGhostQuota) but can only consume
 * credits via routes that call consumeGhostAction() with the service
 * role — the RPC itself is granted to service_role only.
 */

import { jsonResponse } from "./_shared.js";
import { verifyGhostAuthHeader } from "./_ghostAuth.js";

export type GhostAction = "interrogate" | "squad" | "recon" | "dawn_patrol";

export interface GhostActionQuota {
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
  reset_at: string | null;
  remaining_seconds: number;
  total_runs: number;
}

export interface GhostQuotaSnapshot {
  allowed: boolean;
  code: "OK" | "AUTH_REQUIRED" | "PAYWALL" | "DAILY_LIMIT" | "UPSTREAM_ERROR";
  tier: "guest" | "free" | "pro";
  is_black_ops: boolean;
  actions: Record<GhostAction, GhostActionQuota>;
}

export interface GhostConsumeResult {
  allowed: boolean;
  code: "OK" | "AUTH_REQUIRED" | "PAYWALL" | "DAILY_LIMIT" | "INVALID_ACTION" | "UPSTREAM_ERROR";
  action: GhostAction;
  tier: "guest" | "free" | "pro";
  is_black_ops: boolean;
  used: number;
  limit: number;
  remaining: number;
  reset_at: string | null;
  remaining_seconds: number;
  total_runs: number;
}

function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] || (fallback ? process.env[fallback] : "") || "";
  if (!value) throw new Error(`${name} is not configured`);
  return value.replace(/\/$/, "");
}

function supabaseCreds() {
  return {
    url: requiredEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
    key: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

/**
 * MP7: delegates to the shared Ghost auth layer.
 *
 * Two defects are resolved here. (1) The previous implementation passed the
 * service-role key as the Authorization bearer when calling GoTrue, which
 * authenticated the service rather than the caller. (2) Ghost mutation routes
 * verify once in the route handler and again here; because the shared layer
 * memoises by token for a short TTL, that second verification is now served
 * from memory instead of a second blocking round-trip to GoTrue.
 */
async function verifyBearerToken(authorization: string | null): Promise<{ userId: string; jwt: string } | null> {
  const identity = await verifyGhostAuthHeader(authorization);
  return identity ? { userId: identity.userId, jwt: identity.jwt } : null;
}

/**
 * Read the caller's current ghost-quota snapshot. Uses the caller's JWT
 * (no service-role privilege escalation needed — authenticated can
 * execute get_ghost_quota).
 */
export async function getGhostQuota(req: Request): Promise<GhostQuotaSnapshot> {
  const authHeader = req.headers.get("authorization") || "";
  const verified = await verifyBearerToken(authHeader);
  if (!verified) {
    return {
      allowed: false,
      code: "AUTH_REQUIRED",
      tier: "guest",
      is_black_ops: false,
      actions: {
        interrogate: { used: 0, limit: 0, remaining: 0, allowed: false, reset_at: null, remaining_seconds: 0, total_runs: 0 },
        squad:       { used: 0, limit: 0, remaining: 0, allowed: false, reset_at: null, remaining_seconds: 0, total_runs: 0 },
        recon:       { used: 0, limit: 0, remaining: 0, allowed: false, reset_at: null, remaining_seconds: 0, total_runs: 0 },
        dawn_patrol: { used: 0, limit: 0, remaining: 0, allowed: false, reset_at: null, remaining_seconds: 0, total_runs: 0 },
      },
    };
  }
  const { url } = supabaseCreds();
  // Use the ANON key for this call (we just need to pass a JWT) — the
  // function is grant'd to authenticated.
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_ANON_KEY || "";
  const apikey = anonKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_ghost_quota`, {
      method: "POST",
      headers: {
        apikey,
        Authorization: `Bearer ${verified.jwt}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.error("[ghost-ledger] get_ghost_quota rpc failed:", res.status);
      throw new Error("quota rpc failed");
    }
    const payload = (await res.json()) as GhostQuotaSnapshot;
    return payload;
  } catch (err) {
    console.error("[ghost-ledger] get_ghost_quota error, fail-closed to zero:", err);
    return {
      allowed: false,
      code: "UPSTREAM_ERROR",
      tier: "free",
      is_black_ops: false,
      actions: {
        interrogate: { used: 0, limit: 0, remaining: 0, allowed: false, reset_at: null, remaining_seconds: 0, total_runs: 0 },
        squad:       { used: 0, limit: 0, remaining: 0, allowed: false, reset_at: null, remaining_seconds: 0, total_runs: 0 },
        recon:       { used: 0, limit: 0, remaining: 0, allowed: false, reset_at: null, remaining_seconds: 0, total_runs: 0 },
        dawn_patrol: { used: 0, limit: 0, remaining: 0, allowed: false, reset_at: null, remaining_seconds: 0, total_runs: 0 },
      },
    };
  }
}

/**
 * Atomically consume one credit for `action`. Uses the service-role key
 * with a user-id argument to the SECURITY DEFINER RPC. We've already
 * authenticated the JWT ourselves via /auth/v1/user.
 *
 * Fail-CLOSED: if Supabase is unreachable we return {allowed:false}
 * (unlike the clone-crush legacy path which was fail-open). Credits must
 * not be grantable when we can't verify entitlement.
 */
export async function consumeGhostAction(
  req: Request,
  action: GhostAction,
): Promise<GhostConsumeResult> {
  const authHeader = req.headers.get("authorization") || "";
  const verified = await verifyBearerToken(authHeader);
  if (!verified) {
    return {
      allowed: false, code: "AUTH_REQUIRED", action,
      tier: "guest", is_black_ops: false,
      used: 0, limit: 0, remaining: 0,
      reset_at: null, remaining_seconds: 0, total_runs: 0,
    };
  }
  const { url, key } = supabaseCreds();
  try {
    const res = await fetch(`${url}/rest/v1/rpc/consume_ghost_action`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_user_id: verified.userId, p_action: action }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) {
      console.error(`[ghost-ledger] consume(${action}) rpc HTTP ${res.status}`);
      return {
        allowed: false, code: "UPSTREAM_ERROR", action,
        tier: "free", is_black_ops: false,
        used: 0, limit: 0, remaining: 0,
        reset_at: null, remaining_seconds: 0, total_runs: 0,
      };
    }
    const payload = (await res.json()) as GhostConsumeResult;
    return payload;
  } catch (err) {
    console.error(`[ghost-ledger] consume(${action}) error:`, err);
    return {
      allowed: false, code: "UPSTREAM_ERROR", action,
      tier: "free", is_black_ops: false,
      used: 0, limit: 0, remaining: 0,
      reset_at: null, remaining_seconds: 0, total_runs: 0,
    };
  }
}

/** Edge route handler for GET /api/ghost/credits */
export async function handleGhostCredits(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const snap = await getGhostQuota(req);
  return jsonResponse(snap, snap.code === "OK" || snap.code === "AUTH_REQUIRED" ? 200 : 503);
}
