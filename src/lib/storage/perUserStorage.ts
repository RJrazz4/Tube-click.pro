/**
 * Per-user localStorage adapter for zustand persist.
 *
 * Problem: zustand's default createJSONStorage(() => localStorage) persists
 * to a fixed key per origin. When User A signs out of a shared browser and
 * User B signs in on the same device (or when the Supabase session is
 * restored slowly on first paint), the persisted blobs for profile,
 * generated content, workflow state, license, AND the mirrored auth/user
 * snapshot from the PREVIOUS user hydrate into the new user's session —
 * causing flash-of-wrong-account, cross-user data leaks, and "login keeps
 * flipping back" symptoms.
 *
 * This adapter wraps localStorage under a NAMESPACED key
 *   `tc:u:<baseKey>:u:<userId>` (or `tc:u:<baseKey>:guest` pre-auth).
 *
 * The active userId is resolved from either (a) an injected getter (used
 * by stores that can ask useAuthStore for current user), or (b) the
 * durable `tc:last-auth-user-id` pin that the Supabase auth client writes
 * the instant it persists a session. This means the namespace is
 * deterministic BEFORE React mounts — no window where the wrong user's
 * blob could hydrate.
 *
 * Server data (Supabase) is already isolated by RLS + SECURITY DEFINER
 * RPCs using auth.uid(); this fixes the CLIENT-SIDE cross-user leak.
 */
import { createJSONStorage, type StateStorage } from "zustand/middleware";

const NAMESPACE_PREFIX = "tc:u:";
const GUEST_SUFFIX = ":guest";
/** Durable pin written by the Supabase auth client the moment a session is persisted. */
export const AUTH_USER_PIN_KEY = "tc:last-auth-user-id";
const LEGACY_KEYS = new Set([
  "tubegenius-auth-store",
  "tubegenius-app-store",
  "tubegenius-clone-crush-store",
  "tubegenius-content-store-v2",
  "tubeclick-creator-workflow-v1",
  "tubegenius-stats",
  "tubegenius-content",
]);

/**
 * Resolve the currently-pinned user id synchronously from localStorage.
 * Returns null when no user is pinned (pre-auth / signed-out) — callers
 * map that to the `:guest` bucket.
 */
export function getPinnedUserId(): string | null {
  try {
    const uid = localStorage.getItem(AUTH_USER_PIN_KEY);
    return uid && uid.trim().length > 0 ? uid : null;
  } catch {
    return null;
  }
}

/** Pin a userId as the active authenticated storage namespace. */
export function pinUserId(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(AUTH_USER_PIN_KEY, userId);
    else localStorage.removeItem(AUTH_USER_PIN_KEY);
  } catch { /* noop */ }
}

function storageKey(baseKey: string, userId: string | null): string {
  if (!userId) return `${NAMESPACE_PREFIX}${baseKey}${GUEST_SUFFIX}`;
  return `${NAMESPACE_PREFIX}${baseKey}:u:${userId}`;
}

function readRaw(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeRaw(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* noop */ }
}
function removeRaw(key: string): void {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

export function createPerUserStorage(baseKey: string, getUserId?: () => string | null): StateStorage {
  // A tiny JSONStorage that proxies getItem/setItem/removeItem to a
  // userId-namespaced key. The zustand persist middleware will call
  // these methods on every read/write, so the namespace is recomputed
  // against the CURRENT session every time — no stale closures.
  //
  // Resolution order: explicit getter (useAuthStore live snapshot) →
  // durable pin written by Supabase auth client → guest. This keeps the
  // namespace deterministic even before React mounts / the auth store
  // itself is rehydrating (which is the chicken-and-egg window where
  // the old flat-key design leaked user B's data onto user A).
  const resolveUserId = (): string | null => {
    if (getUserId) {
      try {
        const uid = getUserId();
        if (uid) return uid;
      } catch { /* noop */ }
    }
    return getPinnedUserId();
  };
  const getKey = () => storageKey(baseKey, resolveUserId());
  return {
    getItem: (name) => {
      // `name` is the persist `name` field; we ignore it and use our
      // namespaced key derived from the live userId.
      void name;
      const key = getKey();
      const raw = readRaw(key);
      // Migration on first read for the authenticated bucket: if the
      // namespaced key is empty but a legacy un-namespaced copy exists
      // (pre-isolation build), copy it into the namespaced slot once so
      // existing users don't lose their own saved content.
      if (!raw && LEGACY_KEYS.has(baseKey)) {
        const legacy = readRaw(baseKey);
        if (legacy && resolveUserId()) {
          writeRaw(key, legacy);
          // Best-effort: leave legacy in place for one session so the
          // migration is non-destructive; a future sign-out clears it.
        }
      }
      return raw ?? null;
    },
    setItem: (name, value) => {
      void name;
      writeRaw(getKey(), value);
    },
    removeItem: (name) => {
      void name;
      removeRaw(getKey());
    },
  };
}

/**
 * Wipe every persisted zustand blob for the previous user (both the
 * userId-namespaced bucket and any legacy un-namespaced keys) AND the
 * guest bucket. Called from SoftGateProvider the instant a new auth
 * session is established or a sign-out happens so the next user starts
 * from a clean slate.
 */
export function purgeAllUserStores(userId?: string | null): void {
  try {
    const keysToRemove = new Set<string>();
    LEGACY_KEYS.forEach((k) => keysToRemove.add(k));
    LEGACY_KEYS.forEach((k) => keysToRemove.add(`${NAMESPACE_PREFIX}${k}${GUEST_SUFFIX}`));
    if (userId) {
      LEGACY_KEYS.forEach((k) => keysToRemove.add(storageKey(k, userId)));
    }
    // Also sweep any namespaced keys we can find (covers future stores).
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(NAMESPACE_PREFIX) || LEGACY_KEYS.has(key))) {
        keysToRemove.add(key);
      }
    }
    keysToRemove.forEach((k) => removeRaw(k));
  } catch { /* noop */ }
}

/**
 * Re-export of the JSON storage wrapper so callers can still opt-in to
 * standard JSON serialization without re-implementing it.
 */
export { createJSONStorage };
