import { describe, expect, it } from "vitest";

import { defaultTierLimits, parseTierLimits } from "./tier-limits.js";

function collect() {
  const issues: string[] = [];
  return { issues, sink: (m: string) => issues.push(m) };
}

describe("defaultTierLimits (Master Plan F1 business model)", () => {
  it("free: 4 scenes, thumbnails [1,2]", () => {
    expect(defaultTierLimits().free).toEqual({ maxScenes: 4, thumbnailOptions: [1, 2] });
  });

  it("pro: 8 scenes, thumbnails [1,2,4]", () => {
    expect(defaultTierLimits().pro).toEqual({ maxScenes: 8, thumbnailOptions: [1, 2, 4] });
  });

  it("cinematic: unlimited scenes (null), thumbnails [1,2,4]", () => {
    expect(defaultTierLimits().cinematic).toEqual({
      maxScenes: null,
      thumbnailOptions: [1, 2, 4],
    });
  });
});

describe("parseTierLimits", () => {
  it("returns defaults for missing or blank input", () => {
    const inputs: Array<string | undefined | null> = [undefined, null, "", "  "];
    for (const raw of inputs) {
      const { issues, sink } = collect();
      expect(parseTierLimits(raw, sink)).toEqual(defaultTierLimits());
      expect(issues).toEqual([]);
    }
  });

  it("deep-merges a partial override onto defaults", () => {
    const { sink } = collect();
    const limits = parseTierLimits('{"free":{"maxScenes":6}}', sink);
    expect(limits?.free.maxScenes).toBe(6);
    expect(limits?.free.thumbnailOptions).toEqual([1, 2]);
    expect(limits?.pro).toEqual(defaultTierLimits().pro);
    expect(limits?.cinematic).toEqual(defaultTierLimits().cinematic);
  });

  it("honours an explicit maxScenes:null (unlimited)", () => {
    const { sink } = collect();
    expect(parseTierLimits('{"free":{"maxScenes":null}}', sink)?.free.maxScenes).toBeNull();
  });

  it("normalizes thumbnail options: deduped, ascending", () => {
    const { sink } = collect();
    const limits = parseTierLimits('{"pro":{"thumbnailOptions":[4,1,4,2]}}', sink);
    expect(limits?.pro.thumbnailOptions).toEqual([1, 2, 4]);
  });

  it("rejects malformed JSON", () => {
    const { issues, sink } = collect();
    expect(parseTierLimits("{free:}", sink)).toBeNull();
    expect(issues[0]).toContain("valid JSON");
  });

  it("rejects unknown tier names (strict)", () => {
    const { issues, sink } = collect();
    expect(parseTierLimits('{"vip":{"maxScenes":99}}', sink)).toBeNull();
    expect(issues.join(" ")).toContain("vip");
  });

  it("rejects thumbnail options outside [1,2,4]", () => {
    const { sink } = collect();
    expect(parseTierLimits('{"free":{"thumbnailOptions":[1,3]}}', sink)).toBeNull();
  });

  it("rejects empty thumbnail option lists", () => {
    const { sink } = collect();
    expect(parseTierLimits('{"free":{"thumbnailOptions":[]}}', sink)).toBeNull();
  });

  it("rejects non-positive or fractional scene limits", () => {
    for (const raw of ['{"pro":{"maxScenes":0}}', '{"pro":{"maxScenes":-2}}', '{"pro":{"maxScenes":2.5}}']) {
      const { sink } = collect();
      expect(parseTierLimits(raw, sink)).toBeNull();
    }
  });

  it("does not share mutable state between parses", () => {
    const { sink } = collect();
    const first = parseTierLimits(undefined, sink);
    first?.free.thumbnailOptions.push(4);
    expect(defaultTierLimits().free.thumbnailOptions).toEqual([1, 2]);
  });
});
