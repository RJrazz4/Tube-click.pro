import { describe, expect, it } from "vitest";

import {
  emptyImageKeyPools,
  IMAGE_PROVIDER_IDS,
  parseImageKeyPools,
} from "./image-keys.js";

function collect() {
  const issues: string[] = [];
  return { issues, sink: (m: string) => issues.push(m) };
}

describe("parseImageKeyPools", () => {
  it("returns empty pools for missing or blank input", () => {
    const inputs: Array<string | undefined | null> = [undefined, null, "", "   "];
    for (const raw of inputs) {
      const { issues, sink } = collect();
      expect(parseImageKeyPools(raw, sink)).toEqual({ agnes: [], gemini: [], hf: [] });
      expect(issues).toEqual([]);
    }
  });

  it("parses multiple pools preserving order and deduping keys", () => {
    const { issues, sink } = collect();
    const pools = parseImageKeyPools("agnes:a1,a2;gemini:g1;hf:h1,h2,h1", sink);
    expect(issues).toEqual([]);
    expect(pools).toEqual({ agnes: ["a1", "a2"], gemini: ["g1"], hf: ["h1", "h2"] });
  });

  it("tolerates whitespace around separators", () => {
    const { sink } = collect();
    expect(parseImageKeyPools(" agnes : a1 , a2 ; hf : h1 ", sink)).toEqual({
      agnes: ["a1", "a2"],
      gemini: [],
      hf: ["h1"],
    });
  });

  it("ignores trailing and repeated group separators", () => {
    const { sink } = collect();
    expect(parseImageKeyPools("hf:h1;;", sink)).toEqual({
      agnes: [],
      gemini: [],
      hf: ["h1"],
    });
  });

  it("accepts documented provider aliases", () => {
    const { sink } = collect();
    expect(parseImageKeyPools("agnes-flash:x;gemini-flash:y;huggingface:z", sink)).toEqual({
      agnes: ["x"],
      gemini: ["y"],
      hf: ["z"],
    });
  });

  it("merges repeated provider groups, deduped", () => {
    const { sink } = collect();
    const pools = parseImageKeyPools("hf:h1;hf:h1,h2", sink);
    expect(pools?.hf).toEqual(["h1", "h2"]);
  });

  it("rejects unknown providers without echoing key material", () => {
    const { issues, sink } = collect();
    expect(parseImageKeyPools("gemeni:SECRETKEY123", sink)).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("gemeni");
    expect(issues[0]).toContain("agnes, gemini, hf");
    expect(issues[0]).not.toContain("SECRETKEY123");
  });

  it("rejects groups missing the provider colon, referencing position only", () => {
    const { issues, sink } = collect();
    expect(parseImageKeyPools("agnes:a1;dangling-secret", sink)).toBeNull();
    expect(issues[0]).toContain("group #2");
    expect(issues[0]).not.toContain("dangling-secret");
  });

  it("rejects a pool that declares no keys", () => {
    const { issues, sink } = collect();
    expect(parseImageKeyPools("agnes:", sink)).toBeNull();
    expect(issues[0]).toContain('pool "agnes" declares no keys');
  });
});

describe("image provider constants", () => {
  it("exposes canonical provider ids", () => {
    expect(IMAGE_PROVIDER_IDS).toEqual(["agnes", "gemini", "hf"]);
  });

  it("emptyImageKeyPools returns an independent object per call", () => {
    const a = emptyImageKeyPools();
    a.agnes.push("mutated");
    expect(emptyImageKeyPools().agnes).toEqual([]);
  });
});
