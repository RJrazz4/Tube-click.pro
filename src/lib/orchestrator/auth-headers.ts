/**
 * Phase G1 — Auth header provider for the orchestrator client.
 *
 * The server resolves tier + identity from the session token; the client
 * merely attaches it when one exists. Imported lazily so the orchestrator
 * client module never hard-depends on the auth stack (keeps unit tests
 * hermetic and the module usable in any mount).
 */
export async function getSessionAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
