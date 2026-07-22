/**
 * Ghost Protocol v2 - Canonical Domain Engine
 * Ensures referral links ALWAYS show tubeclickpro.in even on Vercel previews
 * Zero-budget, pure client logic, 100% lightweight
 */

const CANONICAL_DOMAIN = "https://tubeclickpro.in";
const CANONICAL_HOST = "tubeclickpro.in";

// Hosts that are considered temporary/bypass and should be rewritten to canonical
const TEMP_HOSTS = [
  "vercel.app",
  "netlify.app",
  "localhost",
  "127.0.0.1",
  "preview",
  "temp",
  "webcontainer",
];

export function isTemporaryHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return TEMP_HOSTS.some(h => lower.includes(h));
}

export function getCanonicalRoot(): string {
  // Priority: ENV VITE_APP_URL > canonical > origin filtered
  const envUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "");
  if (envUrl && envUrl.includes("tubeclickpro.in")) return envUrl;
  if (envUrl && !isTemporaryHost(new URL(envUrl).hostname)) {
    // If envUrl is not temp but is custom, still prefer canonical for referrals
    if (envUrl.includes("tubeclickpro.in")) return envUrl;
  }
  return CANONICAL_DOMAIN;
}

export function getReferralBaseUrl(): string {
  if (typeof window === "undefined") return CANONICAL_DOMAIN;
  const origin = window.location.origin.replace(/\/$/, "");
  try {
    const host = window.location.hostname;
    if (isTemporaryHost(host)) {
      return CANONICAL_DOMAIN;
    }
    // If already on canonical, use it
    if (host.includes(CANONICAL_HOST)) return origin;
    // If custom domain but not temp, still force canonical for virality
    return CANONICAL_DOMAIN;
  } catch {
    return CANONICAL_DOMAIN;
  }
}

export function buildReferralUrl(code: string): string {
  const base = getReferralBaseUrl();
  const cleanCode = code.trim().toUpperCase();
  // Private tracker illusion params
  return `${base}/ref/${cleanCode}?clearance=LEVEL4&node=MUM01&utm_source=ghost&utm_medium=referral`;
}

export function getCanonicalDomainDisplay(): string {
  return CANONICAL_HOST;
}
