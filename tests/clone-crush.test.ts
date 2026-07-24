import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cloneCrushHandler from "../api/clone-crush";

const originalApiKey = process.env.YOUTUBE_API_KEY;
const originalViralThreshold = process.env.VIRAL_VIEW_THRESHOLD;

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
    if (originalViralThreshold === undefined) {
      delete process.env.VIRAL_VIEW_THRESHOLD;
    } else {
      process.env.VIRAL_VIEW_THRESHOLD = originalViralThreshold;
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

describe("Clone & Crush viral quality gate", () => {
  beforeEach(() => {
    vi.stubGlobal("console", {
      ...console,
      warn: vi.fn(),
      error: vi.fn(),
    });
    process.env.YOUTUBE_API_KEY = "test_key";
    delete process.env.VIRAL_VIEW_THRESHOLD;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.YOUTUBE_API_KEY;
    } else {
      process.env.YOUTUBE_API_KEY = originalApiKey;
    }
    if (originalViralThreshold === undefined) {
      delete process.env.VIRAL_VIEW_THRESHOLD;
    } else {
      process.env.VIRAL_VIEW_THRESHOLD = originalViralThreshold;
    }
  });

  it("rejects low-view YouTube API results and only returns 50k+ viral competitors", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("googleapis.com/youtube/v3/search")) {
        return new Response(JSON.stringify({ items: [{ id: { videoId: "lowview0001" } }] }), { status: 200 });
      }
      if (url.includes("googleapis.com/youtube/v3/videos")) {
        return new Response(JSON.stringify({
          items: [{
            id: "lowview0001",
            snippet: { title: "14 views flop", channelTitle: "Tiny Channel", publishedAt: "2026-07-01T00:00:00Z", thumbnails: { high: { url: "https://example.com/low.jpg" } } },
            statistics: { viewCount: "14" },
            contentDetails: { duration: "PT1M" },
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const res = await cloneCrushHandler(buildRequest({ action: "competitors", niche: "AI tutorials" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.viralThreshold).toBe(50_000);
    expect(body.competitors.length).toBeGreaterThan(0);
    expect(body.competitors.every((video: any) => video.viewsCount >= 50_000)).toBe(true);
    expect(body.competitors.some((video: any) => video.title === "14 views flop" || video.viewsCount === 14)).toBe(false);
  });

  it("keeps live API winners but filters out sub-threshold garbage", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("googleapis.com/youtube/v3/search")) {
        return new Response(JSON.stringify({
          items: [
            { id: { videoId: "viral000001" } },
            { id: { videoId: "viral000002" } },
            { id: { videoId: "flop0000001" } },
          ],
        }), { status: 200 });
      }
      if (url.includes("googleapis.com/youtube/v3/videos")) {
        return new Response(JSON.stringify({
          items: [
            {
              id: "viral000001",
              snippet: { title: "100k views winner", channelTitle: "Viral Channel", publishedAt: "2026-07-01T00:00:00Z", thumbnails: { high: { url: "https://example.com/viral1.jpg" } } },
              statistics: { viewCount: "100000" },
              contentDetails: { duration: "PT10M" },
            },
            {
              id: "viral000002",
              snippet: { title: "60k views winner", channelTitle: "Viral Channel", publishedAt: "2026-07-02T00:00:00Z", thumbnails: { high: { url: "https://example.com/viral2.jpg" } } },
              statistics: { viewCount: "60000" },
              contentDetails: { duration: "PT12M" },
            },
            {
              id: "flop0000001",
              snippet: { title: "2 views flop", channelTitle: "Tiny Channel", publishedAt: "2026-07-03T00:00:00Z", thumbnails: { high: { url: "https://example.com/flop.jpg" } } },
              statistics: { viewCount: "2" },
              contentDetails: { duration: "PT1M" },
            },
          ],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    const res = await cloneCrushHandler(buildRequest({ action: "competitors", niche: "AI tutorials" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.ghostReconstructed).toBe(false);
    expect(body.competitors.map((video: any) => video.title)).toEqual(["100k views winner", "60k views winner"]);
    expect(body.competitors.every((video: any) => video.viewsCount >= 50_000)).toBe(true);
    expect(body.competitors.some((video: any) => video.title === "2 views flop")).toBe(false);
  });
});
