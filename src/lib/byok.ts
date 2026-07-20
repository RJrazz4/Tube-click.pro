/**
 * @deprecated — REMOVED in Phase A1 Secure Audit
 * TubeClick Pro no longer uses client-side BYOK (Bring Your Own Key).
 * All API keys are server-only via Deno.env / process.env.
 *
 * This file is intentionally neutered to prevent accidental usage.
 * GhostAdmin / TopBar now only handle locker_url, not API keys.
 */

export interface AdminConfig {
  locker_url: string;
}

const CONFIG_KEY = "tubegenius_admin_config";

function readStoredConfig(): Partial<AdminConfig> {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getStoredAdminConfig(): AdminConfig {
  const stored = readStoredConfig();
  return {
    locker_url: (stored.locker_url || "").trim(),
  };
}

// Stub — always returns undefined. Server uses env vars only.
export function getStoredApiKey(_type: "image" | "text" | "voice"): string | undefined {
  return undefined;
}
