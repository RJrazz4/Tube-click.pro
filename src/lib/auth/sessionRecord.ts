/**
 * Pure session-record recovery helper, split out of the Supabase client so it
 * can be unit-tested in a plain Node environment (importing the client module
 * constructs a live Supabase client, which is unsuitable for tests).
 */
export function findValidSessionRecord(
  entries: Array<[string, string | null]>,
): string | null {
  for (const [, value] of entries) {
    if (!value) continue;
    try {
      const parsed = JSON.parse(value);
      const token = parsed?.access_token ?? parsed?.currentSession?.access_token;
      if (typeof token === 'string' && token.length > 0) return value;
    } catch {
      // Not a JSON session record; skip.
    }
  }
  return null;
}
