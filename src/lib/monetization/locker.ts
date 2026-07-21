/** Optional sponsor-verification URL used for free export tasks. */
interface LockerConfig {
  lockerUrl: string;
}

const CONFIG_KEY = "tubegenius_locker_config";

function readConfig(): LockerConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { lockerUrl: typeof parsed.locker_url === "string" ? parsed.locker_url : "" };
    }
  } catch {
    // Invalid local configuration falls back to no sponsor verification.
  }
  return { lockerUrl: "" };
}

export function getLockerUrl(): string {
  return readConfig().lockerUrl;
}

export function setLockerUrl(url: string) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ locker_url: url }));
}
