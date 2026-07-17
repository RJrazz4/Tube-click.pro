/**
 * Monetization Locker — Phase A3 Prep
 * Architecture ready for Stripe/Paywall tier guard.
 * No hard dependency yet, just type-safe tier checks + locker URL resolver.
 */

export type SubscriptionTier = "free" | "pro" | "enterprise";

interface LockerConfig {
  lockerUrl: string;
  tier: SubscriptionTier;
}

const CONFIG_KEY = "tubegenius_locker_config";
const DEFAULT_LOCKER = "";

function readConfig(): LockerConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        lockerUrl: typeof parsed.locker_url === "string" ? parsed.locker_url : DEFAULT_LOCKER,
        tier: (parsed.tier as SubscriptionTier) || "free",
      };
    }
  } catch {}
  return { lockerUrl: DEFAULT_LOCKER, tier: "free" };
}

export function getLockerUrl(): string {
  // Server can override via edge function, but for now read from local config
  // In production, this will be fetched from /api/config (server-only)
  const cfg = readConfig();
  return cfg.lockerUrl;
}

export function setLockerUrl(url: string) {
  const current = readConfig();
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...current, locker_url: url }));
}

export function getSubscriptionTier(): SubscriptionTier {
  return readConfig().tier;
}

export function canAccessFeature(requiredTier: SubscriptionTier): boolean {
  const tierOrder: Record<SubscriptionTier, number> = { free: 0, pro: 1, enterprise: 2 };
  return tierOrder[getSubscriptionTier()] >= tierOrder[requiredTier];
}

export function requiresPaywall(requiredTier: SubscriptionTier = "pro"): boolean {
  return !canAccessFeature(requiredTier) && !!getLockerUrl();
}
