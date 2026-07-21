/**
 * PLG soft gate: one anonymous product action per browser, then authentication.
 * Uses a signed HttpOnly cookie plus a local client marker for resilient gating.
 * No fingerprinting or raw network identifiers are collected.
 */
export const config = { runtime: 'edge' };

import { corsHeaders, safeJsonBody } from './_shared.js';

const COOKIE_NAME = '_tc_guest_preview';
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60; // Current browser maximum for persistent cookies.

type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };

function json(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] || (fallback ? process.env[fallback] : '') || '';
  if (!value) throw new Error(`${name} is not configured`);
  return value.replace(/\/$/, '');
}

function bytesToHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env('GUEST_ACCESS_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const [key, ...rawValue] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

async function hasConsumedPreview(req: Request): Promise<boolean> {
  const value = readCookie(req, COOKIE_NAME);
  if (!value) return false;
  const [state, issuedAt, signature, ...extra] = value.split('.');
  // Fail closed when the gate cookie is present but malformed or tampered.
  if (extra.length || state !== 'used' || !/^\d+$/.test(issuedAt || '') || !signature) return true;
  const expected = await sign(`${state}.${issuedAt}`);
  if (!safeEqual(signature, expected)) console.warn('[guest-access] rejected a tampered gate cookie');
  return true;
}

async function usedCookie(): Promise<string> {
  const payload = `used.${Math.floor(Date.now() / 1000)}`;
  return `${COOKIE_NAME}=${encodeURIComponent(`${payload}.${await sign(payload)}`)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
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

async function proEntitlement(userId: string): Promise<{ active: boolean; expires_at: string | null; source: string | null }> {
  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const result = await fetch(`${supabaseUrl}/rest/v1/rpc/get_pro_entitlement`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_id: userId }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!result.ok) throw new Error('Could not load Pro entitlement');
  const payload = await result.json() as
    | { active: boolean; expires_at: string | null; source: string | null }
    | Array<{ active: boolean; expires_at: string | null; source: string | null }>;
  const entitlement = Array.isArray(payload) ? payload[0] : payload;
  if (!entitlement || typeof entitlement.active !== 'boolean') throw new Error('Pro entitlement response was invalid');
  return entitlement;
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const bodyResult = await safeJsonBody(req);
    if (bodyResult.error) return json({ error: bodyResult.error }, 400);
    const action = bodyResult.data?.action;
    const user = await authenticatedUser(req);

    if (action === 'entitlement') {
      if (!user) return json({ error: 'Authentication required', code: 'AUTH_REQUIRED' }, 401);
      const entitlement = await proEntitlement(user.id);
      return json({
        success: true,
        authenticated: true,
        proActive: entitlement.active,
        proExpiresAt: entitlement.expires_at,
        proSource: entitlement.source,
      });
    }

    const consumed = await hasConsumedPreview(req);
    if (action === 'status') {
      return json({
        success: true,
        authenticated: Boolean(user),
        previewAvailable: Boolean(user) || !consumed,
      });
    }

    if (action === 'consume') {
      if (user) return json({ success: true, authenticated: true, previewAvailable: true });
      if (consumed) {
        return json({
          error: "You've already used your free preview. Sign in to continue.",
          code: 'AUTH_REQUIRED',
          previewAvailable: false,
        }, 403);
      }
      return json(
        { success: true, authenticated: false, previewAvailable: false },
        200,
        { 'Set-Cookie': await usedCookie() },
      );
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (error) {
    console.error('[guest-access] request failed:', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'Guest access service is temporarily unavailable' }, 503);
  }
}
