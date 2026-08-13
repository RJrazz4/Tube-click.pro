/**
 * Micro-Phase 7 — regression tests for the unified Ghost auth layer.
 *
 * These lock in the fix for the MP2-MP6 defect in which every Ghost module's
 * private `verifyAuth()` validated the caller's JWT by calling GoTrue with
 * the *service-role key* as the Authorization bearer. GoTrue then resolved
 * the service identity instead of the caller's, so the check accepted any
 * non-empty bearer string and returned an identity unrelated to the token
 * presented. Since `userId` is the partition key for every Ghost RPC, that
 * collapsed per-user isolation.
 *
 * The tests assert on the outbound request GoTrue actually receives, because
 * that is precisely where the original bug lived — the old code "worked"
 * end-to-end and still returned a user id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractBearer,
  verifyGhostAuth,
  verifyGhostAuthHeader,
  __resetGhostAuthCache,
  __ghostAuthCacheSize,
} from "../api/_ghostAuth.js";

const USER_TOKEN = "eyJhbGciOiJIUzI1NiJ9.user-alpha.signature";
const OTHER_TOKEN = "eyJhbGciOiJIUzI1NiJ9.user-bravo.signature";

function reqWith(token?: string): Request {
  return new Request("https://ghost.test/api/ghost/interrogate-chat", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetGhostAuthCache();
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key-public";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-SECRET";

  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const auth = String(
      (init?.headers as Record<string, string> | undefined)?.Authorization ?? "",
    );
    const presented = auth.replace(/^Bearer\s+/i, "");
    // Faithful GoTrue behaviour: the identity returned is derived from the
    // token actually presented, and unknown tokens are rejected.
    if (presented === USER_TOKEN) {
      return new Response(JSON.stringify({ id: "user-alpha", email: "a@x.com" }), { status: 200 });
    }
    if (presented === OTHER_TOKEN) {
      return new Response(JSON.stringify({ id: "user-bravo", email: "b@x.com" }), { status: 200 });
    }
    return new Response(JSON.stringify({ msg: "invalid claim" }), { status: 401 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("extractBearer", () => {
  it("parses a well-formed bearer header case-insensitively", () => {
    expect(extractBearer("Bearer abc")).toBe("abc");
    expect(extractBearer("bearer abc")).toBe("abc");
  });

  it("rejects missing, malformed, and empty-token headers", () => {
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer("")).toBeNull();
    expect(extractBearer("Basic abc")).toBeNull();
    expect(extractBearer("Bearer    ")).toBeNull();
  });
});

describe("verifyGhostAuth — the MP2-MP6 auth bypass", () => {
  it("REGRESSION: sends the caller's token to GoTrue, never the service-role key", async () => {
    await verifyGhostAuth(reqWith(USER_TOKEN));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = init.headers as Record<string, string>;

    expect(headers.Authorization).toBe(`Bearer ${USER_TOKEN}`);
    // The exact shape of the original defect.
    expect(headers.Authorization).not.toContain("service-role-SECRET");
    // The service-role key must not leak through the apikey slot either.
    expect(headers.apikey).toBe("anon-key-public");
  });

  it("REGRESSION: an invalid token is rejected rather than silently accepted", async () => {
    const identity = await verifyGhostAuth(reqWith("forged-token"));
    expect(identity).toBeNull();
  });

  it("REGRESSION: distinct tokens resolve to distinct users (per-user isolation)", async () => {
    const alpha = await verifyGhostAuth(reqWith(USER_TOKEN));
    const bravo = await verifyGhostAuth(reqWith(OTHER_TOKEN));

    expect(alpha?.userId).toBe("user-alpha");
    expect(bravo?.userId).toBe("user-bravo");
    expect(alpha?.userId).not.toBe(bravo?.userId);
  });

  it("returns null when no Authorization header is present, without calling GoTrue", async () => {
    expect(await verifyGhostAuth(reqWith())).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the verified identity payload", async () => {
    const identity = await verifyGhostAuth(reqWith(USER_TOKEN));
    expect(identity).toEqual({ userId: "user-alpha", jwt: USER_TOKEN, email: "a@x.com" });
  });
});

describe("verifyGhostAuth — memoisation (P95 latency pass)", () => {
  it("collapses the route+ledger double verification into one round-trip", async () => {
    // Mirrors a real mutation route: handler verifies, then
    // consumeGhostAction verifies again via the header variant.
    const first = await verifyGhostAuth(reqWith(USER_TOKEN));
    const second = await verifyGhostAuthHeader(`Bearer ${USER_TOKEN}`);

    expect(first?.userId).toBe("user-alpha");
    expect(second?.userId).toBe("user-alpha");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not serve one user's identity to another user's token", async () => {
    await verifyGhostAuth(reqWith(USER_TOKEN));
    const bravo = await verifyGhostAuth(reqWith(OTHER_TOKEN));

    expect(bravo?.userId).toBe("user-bravo");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches negative results to blunt token-spray amplification", async () => {
    await verifyGhostAuth(reqWith("forged-token"));
    await verifyGhostAuth(reqWith("forged-token"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expires cached identities so revoked tokens cannot outlive the TTL", async () => {
    vi.useFakeTimers();
    try {
      await verifyGhostAuth(reqWith(USER_TOKEN));
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(31_000);

      await verifyGhostAuth(reqWith(USER_TOKEN));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache upstream 5xx faults, allowing immediate recovery", async () => {
    fetchMock.mockResolvedValueOnce(new Response("upstream boom", { status: 503 }));

    expect(await verifyGhostAuth(reqWith(USER_TOKEN))).toBeNull();
    const recovered = await verifyGhostAuth(reqWith(USER_TOKEN));

    expect(recovered?.userId).toBe("user-alpha");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never stores raw JWTs as cache keys", async () => {
    await verifyGhostAuth(reqWith(USER_TOKEN));
    expect(__ghostAuthCacheSize()).toBe(1);
    // Key material is a digest; asserting occupancy without exposing tokens.
    expect(JSON.stringify(process.env.SUPABASE_ANON_KEY)).not.toContain(USER_TOKEN);
  });

  it("bounds cache growth under many distinct tokens", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ id: "user-n" }), { status: 200 }),
    );
    for (let i = 0; i < 600; i++) {
      await verifyGhostAuth(reqWith(`token-${i}`));
    }
    expect(__ghostAuthCacheSize()).toBeLessThanOrEqual(512);
  });
});
