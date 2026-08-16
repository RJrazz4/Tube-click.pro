const AUTH_RETURN_TO_KEY = "tc:auth:return-to:v1";

function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function safeAuthReturnTo(value: string | null, fallback: string | null = null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const internalOrigin = "https://internal.invalid";
    const resolved = new URL(value, internalOrigin);
    if (resolved.origin !== internalOrigin) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

/** Remember where a full-page OAuth fallback should return in this tab. */
export function rememberAuthReturnTo(path = currentPath()): void {
  const safePath = safeAuthReturnTo(path);
  if (!safePath || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, safePath);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. OAuth
    // still works; the callback simply falls back to the application root.
  }
}

/** Read-once to prevent an old auth attempt from hijacking later navigation. */
export function consumeAuthReturnTo(fallback = "/"): string {
  if (typeof window === "undefined") return fallback;
  try {
    const path = safeAuthReturnTo(window.sessionStorage.getItem(AUTH_RETURN_TO_KEY));
    window.sessionStorage.removeItem(AUTH_RETURN_TO_KEY);
    return path ?? fallback;
  } catch {
    return fallback;
  }
}
