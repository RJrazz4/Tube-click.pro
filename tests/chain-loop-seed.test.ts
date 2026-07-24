import { describe, it, expect } from "vitest";
import { buildTubeBotSeed } from "@/lib/workflow/chainLoopSeed";
import type { CreatorWorkflowSession } from "@/stores/useWorkflowStore";

function wf(overrides: Partial<CreatorWorkflowSession> = {}): CreatorWorkflowSession {
  return {
    id: "wf_test",
    stage: "content-package",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildTubeBotSeed (Chain-Loop → TubeBot mapper)", () => {
  it("returns null when there is no actionable topic (empty workflow)", () => {
    expect(buildTubeBotSeed(null)).toBeNull();
    expect(buildTubeBotSeed(undefined)).toBeNull();
    expect(buildTubeBotSeed(wf())).toBeNull();
  });

  it("prefills topic from the niche when present (broadest angle)", () => {
    const seed = buildTubeBotSeed(
      wf({
        niche: "Crypto & Finance",
        contentPackage: {
          rewriteId: "r1",
          title: "Rewritten title here",
          fullScript: "script body",
          seoTags: ["btc", "eth"],
        },
      }),
    );
    expect(seed).not.toBeNull();
    expect(seed!.topic).toBe("Crypto & Finance");
    // Context carries the working title + script + tags for the model to build on.
    expect(seed!.context).toContain("NICHE: Crypto & Finance");
    expect(seed!.context).toContain("WORKING TITLE: Rewritten title here");
    expect(seed!.context).toContain("SCRIPT FOUNDATION");
    expect(seed!.context).toContain("SEO TAGS: btc, eth");
    expect(seed!.tagCount).toBe(2);
    expect(seed!.scriptChars).toBe("script body".length);
  });

  it("falls back to the rewritten title when no niche is set", () => {
    const seed = buildTubeBotSeed(
      wf({
        contentPackage: { rewriteId: "r1", title: "Title Only", fullScript: "", seoTags: [] },
      }),
    );
    expect(seed!.topic).toBe("Title Only");
    expect(seed!.niche).toBeUndefined();
  });

  it("falls back to the competitor title when neither niche nor package exists", () => {
    const seed = buildTubeBotSeed(
      wf({
        competitor: { videoId: "v1", title: "Competitor Video", url: "https://youtu.be/v1" },
      }),
    );
    expect(seed!.topic).toBe("Competitor Video");
    expect(seed!.competitorTitle).toBe("Competitor Video");
  });

  it("trims whitespace and ignores empty/blank fields", () => {
    const seed = buildTubeBotSeed(
      wf({
        niche: "   ",
        contentPackage: { rewriteId: "r1", title: "  Real Title  ", fullScript: "   ", seoTags: ["", "  ", "good"] },
      }),
    );
    expect(seed!.topic).toBe("Real Title");
    expect(seed!.tagCount).toBe(1); // only "good" survives
    expect(seed!.scriptChars).toBe(0); // blank script ignored
    expect(seed!.context).not.toContain("SCRIPT FOUNDATION");
  });
});
