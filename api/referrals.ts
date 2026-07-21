/**
 * Phase 5 referral API — server-only attribution, HMAC anti-fraud signals,
 * signed HttpOnly cookies, and atomic Supabase reward RPCs.
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
      const accepted = await supabaseRpc<boolean>('record_referral_click', {
        p_ref_code: code,
        p_ip_hash: await ipHash(req),
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
      const outcome = await supabaseRpc<{
        verified: boolean;
        reason?: string;
        verified_referrals?: number;
        friends_unlocked_pro?: number;
        qualified?: boolean;
        pro_tier_expires_at?: string;
      }>(
        'claim_referral_reward',
        {
          p_ref_code: code,
          p_referred_user_id: user.id,
          p_ip_hash: await ipHash(req),
          p_email_domain: emailDomain,
        },
      );
      return response(
        { success: true, ...outcome },
        200,
        { 'Set-Cookie': attributionCookie('', 0), 'Cache-Control': 'no-store' },
      );
    }

    if (action === 'profile') {
      const profile = await supabaseRpc<{
        referral_code: string;
        total_invites: number;
        verified_referrals: number;
        friends_unlocked_pro: number;
        qualified: boolean;
        pro_unlocked_at: string | null;
        pro_tier_expires_at: string | null;
        pro_unlock_source: 'qualified_loop' | 'admin_seed' | null;
      }>('get_referral_dashboard', { p_user_id: user.id });
      return response({
        success: true,
        profile: {
          referralCode: profile.referral_code,
          totalInvites: profile.total_invites,
          verifiedReferrals: profile.verified_referrals,
          friendsUnlockedPro: profile.friends_unlocked_pro,
          qualified: profile.qualified,
          proUnlockedAt: profile.pro_unlocked_at,
          proTierExpiresAt: profile.pro_tier_expires_at,
          proUnlockSource: profile.pro_unlock_source,
        },
      }, 200, { 'Cache-Control': 'private, no-store' });
    }

    return response({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('[referrals] request failed:', error instanceof Error ? error.message : 'unknown error');
    return response({ error: 'Referral service is temporarily unavailable' }, 503);
  }
}
