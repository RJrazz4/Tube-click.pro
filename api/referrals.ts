/**
 * Vercel Edge — /api/referrals
 *
 * Referral attribution, share-link signing, and reward coordination.
 * Uses signed HttpOnly cookies (HMAC under REFERRAL_SIGNING_SECRET),
 * server-side Supabase RPCs for atomic chain evaluation, and Row-Level
 * Security on the referral tables. No client is trusted with grant
 * state. Runtime: Edge.
 */
export const config = { runtime: 'edge' };

import { corsHeaders, safeJsonBody } from './_shared.js';

const COOKIE_NAME = '_tc_ref';
const COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60;
const CODE_PATTERN = /^TC_[A-F0-9]{8}$/;

type AuthUser = { id: string; email?: string };

function response(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] || (fallback ? process.env[fallback] : '') || '';
  if (!value) throw new Error(`${name} is not configured`);
  return value.replace(/\/$/, '');
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmac(value: string): Promise<string> {
  const secret = env('REFERRAL_HASH_SECRET');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

async function ipHash(req: Request): Promise<string> {
  // The raw address never leaves this request and is never persisted or logged.
  return hmac(`ip:v1:${clientIp(req)}`);
}

/**
 * Salted device fingerprint used purely as an anti-abuse signal.
 *
 * Phase 4 anti-abuse is device-strict: one referrer may never bank two
 * qualified referrals from the same device. The fingerprint is derived from
 * stable request characteristics and salted through HMAC, so the raw
 * signature is never stored and the hash is not reversible.
 *
 * A client-supplied fingerprint is accepted when present (it is far more
 * stable than header inference) but is never trusted on its own: it is mixed
 * with server-observed headers, so a client that forges or omits it still
 * produces a usable, non-colliding hash rather than being able to opt out of
 * device tracking entirely.
 *
 * Note this is deliberately NOT tied to user id — it must be comparable
 * across different invitees to detect one person farming many accounts.
 */
async function deviceHash(req: Request, _userId: string): Promise<string> {
  const clientFingerprint = req.headers.get('x-tc-device') || '';
  const userAgent = req.headers.get('user-agent') || '';
  const language = req.headers.get('accept-language') || '';
  const platform = req.headers.get('sec-ch-ua-platform') || '';
  return hmac(`device:v1:${clientFingerprint}|${userAgent}|${language}|${platform}`);
}

function cookieValue(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get('cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

async function createSignedAttribution(code: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = `${code}.${issuedAt}`;
  return `${payload}.${await hmac(`cookie:v1:${payload}`)}`;
}

async function verifySignedAttribution(value: string | null): Promise<string | null> {
  if (!value) return null;
  const [code, issuedAtRaw, signature, ...extra] = value.split('.');
  if (extra.length || !CODE_PATTERN.test(code || '') || !/^\d+$/.test(issuedAtRaw || '') || !signature) return null;
  const issuedAt = Number(issuedAtRaw);
  const now = Math.floor(Date.now() / 1000);
  if (issuedAt > now + 60 || now - issuedAt > COOKIE_TTL_SECONDS) return null;
  const expected = await hmac(`cookie:v1:${code}.${issuedAtRaw}`);
  return constantTimeEqual(signature, expected) ? code : null;
}

function attributionCookie(value: string, maxAge = COOKIE_TTL_SECONDS): string {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

async function supabaseRpc<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const result = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!result.ok) {
    const detail = await result.text().catch(() => '');
    console.error(`[referrals:${functionName}] Supabase RPC failed (${result.status}):`, detail.slice(0, 300));
    throw new Error('Referral service is temporarily unavailable');
  }
  return result.json() as Promise<T>;
}

async function authenticatedUser(req: Request): Promise<AuthUser | null> {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: authorization },
    signal: AbortSignal.timeout(5_000),
  });
  if (!result.ok) return null;
  const user = await result.json() as AuthUser;
  return user?.id ? user : null;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  try {
    const bodyResult = await safeJsonBody(req);
    if (bodyResult.error) return response({ error: bodyResult.error }, 400);
    const action = bodyResult.data?.action;

    if (action === 'click') {
      const code = String(bodyResult.data?.code || '').trim().toUpperCase();
      if (!CODE_PATTERN.test(code)) return response({ error: 'Invalid referral code' }, 400);
      // Phase 4: the click path only validates that the code is real so we can
      // set a signed attribution cookie. It deliberately writes nothing —
      // recording a row per click would let an unauthenticated visitor inflate
      // a referrer's stats and turn this endpoint into a write amplifier.
      const accepted = await supabaseRpc<boolean>('validate_referral_code', {
        p_ref_code: code,
      });
      if (!accepted) return response({ error: 'Referral code not found' }, 404);
      const signedValue = await createSignedAttribution(code);
      return response(
        { success: true },
        200,
        { 'Set-Cookie': attributionCookie(signedValue), 'Cache-Control': 'no-store' },
      );
    }

    const user = await authenticatedUser(req);
    if (!user) return response({ error: 'Authentication required' }, 401);

    if (action === 'claim') {
      const code = await verifySignedAttribution(cookieValue(req, COOKIE_NAME));
      if (!code) return response({ success: true, verified: false, reason: 'no_attribution' });
      const emailDomain = user.email?.split('@').pop()?.toLowerCase() || '';

      // Phase 4 (2-Node): attaching is NOT earning. This records a pending
      // attribution only; the referrer is credited later, by
      // register_core_action(), and only once the invitee performs real work.
      //
      // The RPC returns an intentionally opaque {attached} with no reason
      // string. Anti-abuse verdicts (device duplication, disposable domain,
      // ring membership) are written server-side and never surfaced, so an
      // attacker cannot probe which control rejected them.
      const outcome = await supabaseRpc<{ attached: boolean }>(
        'attach_referral',
        {
          p_invitee_id: user.id,
          p_ref_code: code,
          p_device_hash: await deviceHash(req, user.id),
          p_ip_hash: await ipHash(req),
          p_email_domain: emailDomain,
        },
      );

      return response(
        {
          success: true,
          // `verified` is retained for wire compatibility with existing
          // clients, but under the 2-Node model it means "attribution
          // recorded", never "reward granted".
          verified: outcome.attached === true,
          attached: outcome.attached === true,
          pending: outcome.attached === true,
        },
        200,
        { 'Set-Cookie': attributionCookie('', 0), 'Cache-Control': 'no-store' },
      );
    }

    if (action === 'profile') {
      const profile = await supabaseRpc<{
        exists: boolean;
        referral_code: string;
        total_invites: number;
        qualified_referrals: number;
        pending_referrals: number;
        required_for_reward: number;
        reward_days: number;
        pro_active: boolean;
        pro_expires_at: string | null;
        lifetime_days_granted: number;
        lifetime_day_cap: number;
      }>('get_referral_dashboard', { p_user_id: user.id });

      return response({
        success: true,
        profile: {
          referralCode: profile.referral_code,
          totalInvites: profile.total_invites,
          qualifiedReferrals: profile.qualified_referrals,
          pendingReferrals: profile.pending_referrals,
          requiredForReward: profile.required_for_reward,
          rewardDays: profile.reward_days,
          proActive: profile.pro_active,
          proTierExpiresAt: profile.pro_expires_at,
          lifetimeDaysGranted: profile.lifetime_days_granted,
          lifetimeDayCap: profile.lifetime_day_cap,
        },
      }, 200, { 'Cache-Control': 'private, no-store' });
    }

    return response({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('[referrals] request failed:', error instanceof Error ? error.message : 'unknown error');
    return response({ error: 'Referral service is temporarily unavailable' }, 503);
  }
}
