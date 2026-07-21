import { supabase } from "@/integrations/supabase/client";

const LOCAL_PREVIEW_KEY = "tc_guest_preview_consumed_v1";

interface GuestAccessResponse {
  success?: boolean;
  authenticated?: boolean;
  previewAvailable?: boolean;
  proActive?: boolean;
  proExpiresAt?: string | null;
  proSource?: "qualified_loop" | "admin_seed" | null;
  code?: string;
  error?: string;
}

export class RegistrationRequiredError extends Error {
  constructor() {
    super("Authentication required to continue");
    this.name = "RegistrationRequiredError";
  }
}

async function request(action: "status" | "consume" | "entitlement"): Promise<GuestAccessResponse> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;

  const response = await fetch("/api/guest-access", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ action }),
  });
  const result = await response.json().catch(() => ({ error: "Invalid guest access response" })) as GuestAccessResponse;
  if (response.status === 403 && result.code === "AUTH_REQUIRED") throw new RegistrationRequiredError();
  if (!response.ok) throw new Error(result.error || "Guest access request failed");
  return result;
}

export async function hasAuthenticatedSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

export async function consumeGuestPreview(): Promise<void> {
  if (await hasAuthenticatedSession()) return;

  // Fast local interception; the signed HttpOnly cookie remains authoritative
  // when local storage is cleared or modified.
  if (localStorage.getItem(LOCAL_PREVIEW_KEY) === "true") throw new RegistrationRequiredError();

  // Claim the local slot before the network round-trip so rapid clicks and
  // same-origin tabs cannot start multiple guest actions concurrently.
  localStorage.setItem(LOCAL_PREVIEW_KEY, "true");
  try {
    const result = await request("consume");
    if (result.authenticated) localStorage.removeItem(LOCAL_PREVIEW_KEY);
  } catch (error) {
    if (error instanceof RegistrationRequiredError) {
      localStorage.setItem(LOCAL_PREVIEW_KEY, "true");
      throw error;
    }
    // Development/offline fallback. Production remains protected by the
    // signed server cookie when the endpoint is available.
    localStorage.setItem(LOCAL_PREVIEW_KEY, "true");
  }
}

export async function isGuestWallRequired(): Promise<boolean> {
  if (await hasAuthenticatedSession()) return false;
  if (localStorage.getItem(LOCAL_PREVIEW_KEY) === "true") return true;
  try {
    const result = await request("status");
    if (result.previewAvailable === false) localStorage.setItem(LOCAL_PREVIEW_KEY, "true");
    return result.previewAvailable === false;
  } catch {
    return false;
  }
}

export async function loadProEntitlement(): Promise<{
  active: boolean;
  expiresAt: string | null;
  source: "qualified_loop" | "admin_seed" | null;
}> {
  const result = await request("entitlement");
  return {
    active: Boolean(result.proActive),
    expiresAt: result.proExpiresAt || null,
    source: result.proSource || null,
  };
}
