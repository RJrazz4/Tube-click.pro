import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cloneCrushHandler from "../api/clone-crush";

const originalApiKey = process.env.YOUTUBE_API_KEY;

function buildRequest(body: unknown) {
  return new Request("https://tubeclick.pro/api/clone-crush", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("YouTube API Key Rotation & Timeout / Error Propagation", () => {
  beforeEach(() => {
    vi.stubGlobal("console", {
      ...console,
      warn: vi.fn(),
      error: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.YOUTUBE_API_KEY;
    } else {
      process.env.YOUTUBE_API_KEY = originalApiKey;
    }
  });

  it("fails fast with 502 error if no keys are configured", async () => {
    process.env.YOUTUBE_API_KEY = "";
    const req = buildRequest({ action: "profile", channelUrl: "@Apple" });
    const res = await cloneCrushHandler(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("YOUTUBE_API_KEY is not configured");
  });

  it("retries with the next key if the first key throws a 403 quota exceeded error", async () => {
    process.env.YOUTUBE_API_KEY = "bad_key_1,good_key_2";

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("key=bad_key_1")) {
        return new Response(
          JSON.stringify({
            error: {
              code: 403,
              message: "The request cannot be completed because you have exceeded your quota.",
              errors: [{ reason: "quotaExceeded" }],
            },
          }),
          { status: 403 }
        );
      }
      if (url.includes("key=good_key_2")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "UC123",
                snippet: {
                  title: "Apple",
                  customUrl: "@Apple",
                  thumbnails: {
                    high: { url: "https://example.com/avatar.jpg" },
                  },
                  description: "Official Apple Channel",
                },
                statistics: {
                  subscriberCount: "10000000",
                  videoCount: "150",
                },
                brandingSettings: {
                  image: { bannerExternalUrl: "https://example.com/banner.jpg" },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = buildRequest({ action: "profile", channelUrl: "@Apple" });
    const res = await cloneCrushHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.profile.name).toBe("Apple");
    expect(body.profile.avatar).toBe("https://example.com/avatar.jpg");

    // Verify it called fetch twice with both keys in order
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("key=bad_key_1");
    expect(fetchMock.mock.calls[1][0]).toContain("key=good_key_2");
  });

  it("retries with the next key if the first key times out", async () => {
    process.env.YOUTUBE_API_KEY = "timeout_key,good_key";

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("key=timeout_key")) {
        // Mock a TimeoutError / AbortError
        const err = new DOMException("The user aborted a request.", "TimeoutError");
        throw err;
      }
      if (url.includes("key=good_key")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "UC123",
                snippet: {
                  title: "Apple",
                  customUrl: "@Apple",
                  thumbnails: {
                    high: { url: "https://example.com/avatar.jpg" },
                  },
                  description: "Official Apple Channel",
                },
                statistics: {
                  subscriberCount: "10000000",
                  videoCount: "150",
                },
                brandingSettings: {
                  image: { bannerExternalUrl: "https://example.com/banner.jpg" },
                },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = buildRequest({ action: "profile", channelUrl: "@Apple" });
    const res = await cloneCrushHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.profile.name).toBe("Apple");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("key=timeout_key");
    expect(fetchMock.mock.calls[1][0]).toContain("key=good_key");
  });

  it("exhausts all keys and returns a proper error message (no fake/mock fallback data)", async () => {
    process.env.YOUTUBE_API_KEY = "bad_key_1,bad_key_2";

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      return new Response(
        JSON.stringify({
          error: {
            code: 403,
            message: "The request cannot be completed because you have exceeded your quota.",
            errors: [{ reason: "quotaExceeded" }],
          },
        }),
        { status: 403 }
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const req = buildRequest({ action: "profile", channelUrl: "@Apple" });
    const res = await cloneCrushHandler(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    
    // It must return a clear error, not success, and not dummy profile
    expect(body.success).toBeUndefined();
    expect(body.error).toContain("YouTube Data API requests failed for all 2 configured keys");
    expect(body.error).toContain("exceeded your quota");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
