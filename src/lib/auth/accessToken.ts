import { supabase } from "@/integrations/supabase/client";

/**
 * Shared, bulletproof Supabase access-token resolution used by every outbound
 * authenticated request in the app.
 *
 * `supabase.auth.getSession()` can run before auth has hydrated (returning no
 * session) or hand back an access token already within ~2 minutes of expiry; in
 * either case the remote service rejects the bearer with a 401 and, with only a
 * one-shot read, there is no recovery path. This helper always returns a token
 * the server will accept — transparently refreshing when the cached token is
 * missing, already expired, or close to expiry — and returns `null` only when
 * there is genuinely no signed-in session.
 *
 * `forceRefresh` skips the read and mints a fresh token outright; callers use it
 * after a 401 to recover from a just-rejected (possibly expired) bearer.
 */
const REFRESH_WINDOW_MS = 120_000; // refresh any token within 2 minutes of expiry

export async function getValidAccessToken(
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  const { forceRefresh = false } = options;
  try {
    if (forceRefresh) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    }

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    const token = data.session.access_token || "";
    const expiresAt = data.session.expires_at;
    const expiringSoon =
      typeof expiresAt === "number" && expiresAt * 1000 - Date.now() < REFRESH_WINDOW_MS;

    if (token && !expiringSoon) return token;

    // Missing or near expiry: refresh once so we never send a token the backend
    // is already rejecting. Fall back to the (possibly stale) token only if a
    // refresh is unavailable, then to nothing.
    const { data: freshData } = await supabase.auth.refreshSession();
    return freshData.session?.access_token ?? (token || null);
  } catch {
    return null;
  }
}

/**
 * Return the signed-in user's id, or `null` when not signed in. Same
 * resilience as {@link getValidAccessToken}: a near-expiry session is refreshed
 * so `user.id` is always read from a current session.
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    if (data.session.user?.id) return data.session.user.id;
    const { data: freshData } = await supabase.auth.refreshSession();
    return freshData.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
