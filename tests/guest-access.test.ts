import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import guestAccessHandler from "../api/guest-access";

const originalSecret = process.env.GUEST_ACCESS_SECRET;

function request(action: string, cookie?: string) {
  return new Request("https://tubeclick.pro/api/guest-access", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ action }),
  });
}

describe("PLG guest access edge gate", () => {
  beforeEach(() => {
    process.env.GUEST_ACCESS_SECRET = "test-secret-that-is-long-enough-for-hmac-signing";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.GUEST_ACCESS_SECRET;
    else process.env.GUEST_ACCESS_SECRET = originalSecret;
  });

  it("allows exactly one anonymous preview and signs an HttpOnly cookie", async () => {
    const first = await guestAccessHandler(request("consume"));
    expect(first.status).toBe(200);
    const setCookie = first.headers.get("set-cookie") || "";
    expect(setCookie).toContain("_tc_guest_preview=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");

    const cookie = setCookie.split(";")[0];
    const second = await guestAccessHandler(request("consume", cookie));
    expect(second.status).toBe(403);
    await expect(second.json()).resolves.toMatchObject({ code: "AUTH_REQUIRED", previewAvailable: false });
  });

  it("fails closed when the preview cookie is tampered", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tampered = "_tc_guest_preview=used.1700000000.invalid-signature";
    const response = await guestAccessHandler(request("status", tampered));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ authenticated: false, previewAvailable: false });
  });
});
