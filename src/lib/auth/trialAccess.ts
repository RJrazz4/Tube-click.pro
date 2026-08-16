import { supabase } from "@/integrations/supabase/client";

/**
 * Trial entitlement check (Phase 4).
 *
 * The AI Manager bot grants trials into the public `trials` table (via the
 * Phase 4 trial engine). This helper reads the CURRENT user's active trial —
 * gated by the "users read own trials" RLS policy — so the app can treat a
 * bot-granted trial as temporary Pro access, independently of the referral
 * entitlement.
 */
export interface TrialEntitlement {
  active: boolean;
  expiresAt: string | null;
  planCode: string | null;
  grantReason: string | null;
}

export async function loadTrialEntitlement(): Promise<TrialEntitlement> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return { active: false, expiresAt: null, planCode: null, grantReason: null };

    // `trials` is created by the AI Manager bot migration and is not in the
    // generated Database types — access it via a loosely-typed client.
    const { data, error } = await (supabase as any)
      .from("trials")
      .select("expires_at, plan_code, grant_reason")
      .eq("user_id", userId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[trials] failed to load active trial", error);
      return { active: false, expiresAt: null, planCode: null, grantReason: null };
    }

    const trial = (data as Array<{ expires_at: string; plan_code: string; grant_reason: string }> | null)?.[0];
    if (!trial) return { active: false, expiresAt: null, planCode: null, grantReason: null };

    return {
      active: true,
      expiresAt: trial.expires_at,
      planCode: trial.plan_code,
      grantReason: trial.grant_reason,
    };
  } catch (err) {
    console.error("[trials] trial entitlement check failed", err);
    return { active: false, expiresAt: null, planCode: null, grantReason: null };
  }
}
