import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the app's Supabase singleton so we control session/refresh behaviour.
// vi.mock is hoisted, so the fns must be created with vi.hoisted.
const { refreshSession, getSession } = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession, refreshSession } },
}));

import { getValidAccessToken, getCurrentUserId } from "./accessToken";

describe("getValidAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a healthy token without refreshing", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    getSession.mockResolvedValue({
      data: { session: { access_token: "healthy", expires_at: expiresAt } },
      error: null,
    });
    await expect(getValidAccessToken()).resolves.toBe("healthy");
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes when the token is near expiry", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 30; // < 2 min window
    getSession.mockResolvedValue({
      data: { session: { access_token: "stale", expires_at: expiresAt } },
      error: null,
    });
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "fresh" } },
      error: null,
    });
    await expect(getValidAccessToken()).resolves.toBe("fresh");
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("returns null when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("force-refreshes and returns the new token", async () => {
    refreshSession.mockResolvedValue({
      data: { session: { access_token: "minted" } },
      error: null,
    });
    await expect(getValidAccessToken({ forceRefresh: true })).resolves.toBe("minted");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("returns null when a forced refresh errors", async () => {
    refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("fail") });
    await expect(getValidAccessToken({ forceRefresh: true })).resolves.toBeNull();
  });

  it("falls back to the existing token if a refresh fails", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 5; // already expired
    getSession.mockResolvedValue({
      data: { session: { access_token: "last-known", expires_at: expiresAt } },
      error: null,
    });
    refreshSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(getValidAccessToken()).resolves.toBe("last-known");
  });
});

describe("getCurrentUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the id from a healthy session", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "u-42" } } },
      error: null,
    });
    await expect(getCurrentUserId()).resolves.toBe("u-42");
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("returns null when signed out", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(getCurrentUserId()).resolves.toBeNull();
  });
});
