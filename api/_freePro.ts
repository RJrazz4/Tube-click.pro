/**
 * api/_freePro.ts — server-side mirror of FREE_PRO_MODE (Round 4b).
 *
 * Client-side, `src/lib/monetization/freeProMode.ts` unlocks the UI for any
 * signed-in user who submitted the Professional Details lead form. But the
 * api/ routes re-verify entitlement independently (get_pro_entitlement RPC,
 * ghost credit ledger), so without a server-side mirror the free-Pro promise
 * would break exactly at the flagship tools. This module is that mirror.
 *
 * ACTIVATION: set the Vercel env var FREE_PRO_MODE=1 (Production). When the
 * variable is absent — or anything other than "1" — every function here
 * returns its "off" value, so switch-OFF behavior is byte-identical to the
 * paid behavior that shipped in Rounds 1–3.
 *
 * A user counts as lead-activated when a row exists for them in the
 * `lead_profiles` table (row presence = the form was submitted; the table
 * has no separate submitted flag). The lookup uses the service-role key via
 * PostgREST and fails CLOSED: any error (table not yet migrated, network,
 * RLS) returns false, i.e. current behavior. Importers must still fall back
 * to their normal entitlement path first and treat this as the OR-branch.
 */

/** Server-side flag. The deploy sets FREE_PRO_MODE=1 to turn it on. */
export function freeProServerEnabled(): boolean {
  return (process.env.FREE_PRO_MODE || "").trim() === "1";
}

function supabaseServiceCreds(): { url: string; key: string } {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase service credentials are not configured");
  return { url, key };
}

/**
 * True when the FREE_PRO_MODE server flag is on AND the user has a
 * submitted Professional Details record in `lead_profiles`.
 */
export async function hasLeadActivation(userId: string): Promise<boolean> {
  if (!freeProServerEnabled() || !userId) return false;
  try {
    const { url, key } = supabaseServiceCreds();
    const res = await fetch(
      `${url}/rest/v1/lead_profiles?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(4_000),
      },
    );
    if (!res.ok) return false; // table not migrated / outage → fail closed
    const rows = (await res.json()) as unknown;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}
