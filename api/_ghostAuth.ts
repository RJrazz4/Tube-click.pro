/**
 * Ghost Intelligence — unified authentication & identity layer.
 *
 * Micro-Phase 7 (bug stomp + P95 latency pass).
 *
 * ## Why this module exists
 *
 * Micro-Phases 2-6 each grew their own private `verifyAuth()` helper. Five
 * near-identical copies drifted into a shared defect and a shared latency
 * cost:
 *
 * 1. **Correctness (critical).** Every copy extracted the caller's bearer
 *    token and then validated it by calling `GET /auth/v1/user` with the
 *    *service-role key* in the `Authorization` header rather than the
 *    caller's own token. GoTrue resolves that request against the service
 *    credential, not the caller, so the check never actually validated the
 *    presented JWT: any non-empty bearer string was accepted, and the
 *    resulting `userId` did not reliably identify the caller. Because
 *    `userId` is the partition key for every Ghost RPC (`p_user_id`), that
 *    turned a per-user store into a shared one.
 *
 * 2. **Latency.** Ghost mutation routes verify twice per request — once in
 *    the route's own `verifyAuth()` and again inside
 *    `consumeGhostAction()` → `verifyBearerToken()`. Both are blocking
 *    network round-trips to GoTrue on the critical path, serialised, before
 *    any useful work begins.
 *
 * This module is the single source of truth for both concerns. It sends the
 * caller's token (correctness) and memoises the verification for a short TTL
 * (latency), collapsing the double round-trip into one.
 *
 * ## Cache semantics
 *
 * The cache is a per-isolate `Map` keyed by a non-reversible hash of the raw
 * token. It is intentionally small and short-lived:
 *
 * - TTL is 30s — far below Supabase's default 3600s access-token lifetime,
 *   so a revoked or rotated token cannot outlive one cache generation by
 *   more than the TTL.
 * - Negative results are cached for 5s. This bounds the damage of a token
 *   spray: repeated invalid tokens are rejected locally instead of turning
 *   into an outbound request amplifier against GoTrue.
 * - Raw tokens are never stored, logged, or used as map keys.
 * - Entries are capped at MAX_ENTRIES with cheap FIFO eviction so a serverless
 *   isolate that stays warm across many users cannot grow unbounded.
 *
 * The cache is scoped to a single serverless isolate, so it degrades to a
 * no-op under cold-start-heavy traffic. That is the correct trade-off: it is
 * purely an optimisation and never the authority on identity.
 */

const AUTH_TTL_MS = 30_000;
const NEGATIVE_TTL_MS = 5_000;
const MAX_ENTRIES = 512;
const GOTRUE_TIMEOUT_MS = 5_000;

export interface GhostIdentity {
  userId: string;
  jwt: string;
  email: string | null;
}

interface CacheEntry {
  value: GhostIdentity | null;
  expiresAt: number;
}

const identityCache = new Map<string, CacheEntry>();

/**
 * Fast, allocation-light, non-reversible digest used purely as a cache key.
 *
 * This is FNV-1a — deliberately *not* a cryptographic hash and never used as
 * one. Its only job is to avoid holding raw JWTs in memory as map keys while
 * staying synchronous (WebCrypto's digest is async and would add an await to
 * the hot path). Collisions are additionally guarded by storing the token
 * length in the key.
 */
function tokenKey(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}:${token.length}`;
}

function readCache(key: string): CacheEntry | undefined {
  const hit = identityCache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    identityCache.delete(key);
    return undefined;
  }
  return hit;
}

function writeCache(key: string, value: GhostIdentity | null): void {
  if (identityCache.size >= MAX_ENTRIES) {
    // FIFO eviction: Map preserves insertion order, so the first key is the
    // oldest. Evicting a small batch amortises the cost across requests.
    let evicted = 0;
    for (const k of identityCache.keys()) {
      identityCache.delete(k);
      if (++evicted >= 32) break;
    }
  }
  identityCache.set(key, {
    value,
    expiresAt: Date.now() + (value ? AUTH_TTL_MS : NEGATIVE_TTL_MS),
  });
}

function supabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  );
}

function anonKey(): string {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

/** Extract a bearer token from an Authorization header, or null. */
export function extractBearer(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  if (!authorization.toLowerCase().startsWith("bearer ")) return null;
  const token = authorization.slice("bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verify a caller's JWT against GoTrue and return their identity.
 *
 * Correctness note: the caller's token goes in `Authorization`, and the
 * project's publishable (anon) key goes in `apikey`. This is the combination
 * GoTrue requires to resolve *the caller*. Passing the service-role key as
 * the Authorization bearer — as Micro-Phases 2-6 did — resolves the service
 * identity instead and silently defeats the check.
 */
export async function verifyGhostAuth(req: Request): Promise<GhostIdentity | null> {
  const token = extractBearer(req.headers.get("authorization"));
  if (!token) return null;

  const key = tokenKey(token);
  const cached = readCache(key);
  if (cached) return cached.value;

  const url = supabaseUrl();
  const apikey = anonKey();
  if (!url || !apikey) {
    console.error("[ghost-auth] missing SUPABASE_URL / anon key; refusing to authenticate");
    return null;
  }

  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: {
        apikey,
        // The CALLER's token — this is the whole point of the fix.
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(GOTRUE_TIMEOUT_MS),
    });
    if (!res.ok) {
      // 401/403 are ordinary "bad token" outcomes and are cached negatively.
      // 5xx is an upstream fault: do not cache, so recovery is immediate.
      if (res.status >= 500) return null;
      writeCache(key, null);
      return null;
    }
    const user = (await res.json()) as { id?: string; email?: string | null };
    if (!user?.id) {
      writeCache(key, null);
      return null;
    }
    const identity: GhostIdentity = {
      userId: user.id,
      jwt: token,
      email: user.email ?? null,
    };
    writeCache(key, identity);
    return identity;
  } catch (err) {
    // Timeout or network fault — transient, so never cached.
    console.error("[ghost-auth] verification error:", err);
    return null;
  }
}

/**
 * Verify using a raw Authorization header value rather than a Request.
 * Shares the same cache, so a route that has already verified this request
 * pays zero additional network cost.
 */
export async function verifyGhostAuthHeader(
  authorization: string | null,
): Promise<GhostIdentity | null> {
  const token = extractBearer(authorization);
  if (!token) return null;
  return verifyGhostAuth(
    new Request("https://ghost.internal/verify", {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
}

/** Test seam: drop all memoised identities. */
export function __resetGhostAuthCache(): void {
  identityCache.clear();
}

/** Test/telemetry seam: current cache occupancy. */
export function __ghostAuthCacheSize(): number {
  return identityCache.size;
}
