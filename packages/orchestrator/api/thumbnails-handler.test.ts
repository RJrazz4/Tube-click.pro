import { describe, expect, it } from "vitest";

import { TierPolicy } from "../tiers/index.js";
import type {
  ProviderId,
  ProviderTier,
  UserTier,
} from "../types/index.js";
import type {
  ImageGenerateRequest,
  ImageGenerateResult,
  ImageProvider,
  ProviderHealthReport,
} from "../providers/index.js";

import {
  handleThumbnails,
  thumbnailScene,
  type ThumbnailsHandlerDeps,
  type ThumbnailsResponseBody,
} from "./thumbnails-handler.js";
import type { ApiAuth, ApiErrorBody } from "./types.js";

type Scripted = ImageProvider & { calls: number; requests: ImageGenerateRequest[] };

function stubProvider(
  id: ProviderId,
  tier: ProviderTier,
  script: ReadonlyArray<ImageGenerateResult | Error>,
): Scripted {
  const stub: Scripted = {
    id,
    tier,
    keyless: id === "pollinations",
    calls: 0,
    requests: [],
    isAvailable: () => true,
    healthCheck: async (): Promise<ProviderHealthReport> => ({
      provider: id,
      state: "up",
      latencyMs: 1,
      checkedAt: 0,
    }),
    generate: async (request): Promise<ImageGenerateResult> => {
      stub.requests.push(request);
      const next = script[Math.min(stub.calls, script.length - 1)];
      stub.calls += 1;
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return stub;
}

const endpoint = (id: ProviderId): ImageGenerateResult => ({
  imageUrl: `https://img.test/${id}.png`,
  provider: id,
  urlOnly: id === "pollinations",
  latencyMs: 5,
  keyRotations: 0,
});

const auth = (tier: UserTier): ApiAuth => ({ tier, clientId: `c-${tier}` });
const PROMPT = { prompt: "shocked face, bold title space, high contrast" };

function deps(
  providers: ReadonlyArray<ImageProvider>,
  overrides: Partial<ThumbnailsHandlerDeps> = {},
): ThumbnailsHandlerDeps {
  return { policy: new TierPolicy(), providers, ...overrides };
}

describe("handleThumbnails — F1 count resolution", () => {
  it("no count → the tier default (1)", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const response = await handleThumbnails(PROMPT, auth("free"), deps([hf]));

    expect(response.status).toBe(200);
    const body = response.body as ThumbnailsResponseBody;
    expect(body.count).toBe(1);
    expect(body.thumbnails).toHaveLength(1);
    expect(body.thumbnails[0]).toMatchObject({ status: "success", provider: "hf", costTier: "free" });
  });

  it("allowed count passes through; scenes carry distinct derived seeds", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);
    const response = await handleThumbnails(
      { ...PROMPT, count: 2, seed: 50 },
      auth("free"),
      deps([hf]),
    );

    const body = response.body as ThumbnailsResponseBody;
    expect(body.count).toBe(2);
    expect(hf.calls).toBe(2);
    expect(hf.requests.map((r) => r.seed)).toEqual([50, 51]);
    expect(hf.requests.map((r) => r.requestTag)).toEqual(["scene-0", "scene-1"]);
  });

  it("cinematic can request 4; free cannot (400, loud, never clamped)", async () => {
    const hf = stubProvider("hf", "free", [endpoint("hf")]);

    const ok = await handleThumbnails({ ...PROMPT, count: 4 }, auth("cinematic"), deps([hf]));
    expect((ok.body as ThumbnailsResponseBody).count).toBe(4);

    const denied = await handleThumbnails({ ...PROMPT, count: 4 }, auth("free"), deps([hf]));
    expect(denied.status).toBe(400);
    const body = denied.body as ApiErrorBody;
    expect(body.error.code).toBe("thumbnail_count_not_allowed");
    expect(body.error.details).toEqual({ requested: 4, allowed: [1, 2] });
    expect(hf.calls).toBe(4); // only the cinematic request generated
  });

  it("thumbnail scenes are SIMPLE + 16:9 + auto (free-first routing per mandate)", () => {
    expect(thumbnailScene({ prompt: "p" }, 2)).toEqual({
      index: 2,
      title: "Thumbnail 3",
      prompt: "p",
      negativePrompt: "",
      complexity: "SIMPLE",
      aspectRatio: "16:9",
      routingHint: "auto",
    });
  });
});

describe("handleThumbnails — validation and resilience", () => {
  it("invalid body → 400 with issues", async () => {
    const response = await handleThumbnails({ prompt: "ab" }, auth("pro"), deps([]));
    expect(response.status).toBe(400);
    expect((response.body as ApiErrorBody).error.code).toBe("invalid_request");
  });

  it("zero providers → 200 with failed rows (placeholders for G), not a crash", async () => {
    const response = await handleThumbnails({ ...PROMPT, count: 2 }, auth("pro"), deps([]));
    expect(response.status).toBe(200);
    const body = response.body as ThumbnailsResponseBody;
    expect(body.count).toBe(2);
    expect(body.summary.failed).toBe(2);
    expect(body.thumbnails.every((t) => t.status === "failed")).toBe(true);
  });
});
