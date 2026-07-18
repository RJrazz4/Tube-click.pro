import { describe, expect, it } from "vitest";

import {
  emptyImageKeyPools,
  IMAGE_PROVIDER_IDS,
  parseImageKeyPools,
  parseImageKeyPoolsWithReport,
  parseIndividualEnvKeys,
  mergeKeyPools,
  INDIVIDUAL_KEY_ENV_VARS,
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
      expect(parseImageKeyPools(raw, sink)).toEqual({ agnes: [], gemini: [], hf: [], together: [], replicate: [], nvidia: [] });
      expect(issues).toEqual([]);
    }
  });

  it("parses multiple pools preserving order and deduping keys", () => {
    const { issues, sink } = collect();
    const pools = parseImageKeyPools("agnes:a1,a2;gemini:g1;hf:h1,h2,h1;together:t1,t2;replicate:r1;nvidia:n1", sink);
    expect(issues).toEqual([]);
    expect(pools).toEqual({ agnes: ["a1", "a2"], gemini: ["g1"], hf: ["h1", "h2"], together: ["t1", "t2"], replicate: ["r1"], nvidia: ["n1"] });
  });

  it("tolerates whitespace around separators", () => {
    const { sink } = collect();
    expect(parseImageKeyPools(" agnes : a1 , a2 ; hf : h1 ", sink)).toEqual({
      agnes: ["a1", "a2"],
      gemini: [],
      hf: ["h1"],
      together: [],
      replicate: [],
      nvidia: [],
    });
  });

  it("ignores trailing and repeated group separators", () => {
    const { sink } = collect();
    expect(parseImageKeyPools("hf:h1;;", sink)).toEqual({
      agnes: [],
      gemini: [],
      hf: ["h1"],
      together: [],
      replicate: [],
      nvidia: [],
    });
  });

  it("accepts documented provider aliases", () => {
    const { sink } = collect();
    expect(parseImageKeyPools("agnes-flash:x;gemini-flash:y;huggingface:z;togetherai:t1", sink)).toEqual({
      agnes: ["x"],
      gemini: ["y"],
      hf: ["z"],
      together: ["t1"],
      replicate: [],
      nvidia: [],
    });
  });

  it("accepts nvidia aliases", () => {
    const { sink } = collect();
    expect(parseImageKeyPools("nvidia:n1;nvidia-nim:n2", sink)).toEqual({
      agnes: [],
      gemini: [],
      hf: [],
      together: [],
      replicate: [],
      nvidia: ["n1", "n2"],
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
    expect(issues[0]).toContain("agnes, gemini, hf, together, replicate, nvidia");
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

  it("handles CRLF line endings gracefully", () => {
    const { issues, sink } = collect();
    // Windows-style line endings in the env var (CRLF between groups)
    const pools = parseImageKeyPools("agnes:a1\r\n;gemini:g1\r\n;hf:h1", sink);
    expect(issues).toEqual([]);
    expect(pools).toEqual({ agnes: ["a1"], gemini: ["g1"], hf: ["h1"], together: [], replicate: [], nvidia: [] });
  });

  it("handles trailing \\r from CRLF group splitting", () => {
    const { issues, sink } = collect();
    // Trailing \r after split by ; (edge case from line ending normalization)
    const pools = parseImageKeyPools("agnes:a1\r;gemini:g1\r;hf:h1", sink);
    expect(issues).toEqual([]);
    expect(pools).toEqual({ agnes: ["a1"], gemini: ["g1"], hf: ["h1"], together: [], replicate: [], nvidia: [] });
  });
});

describe("parseImageKeyPoolsWithReport", () => {
  it("reports correct diagnostics for valid input", () => {
    const report = parseImageKeyPoolsWithReport("agnes:a1;gemini:g1;hf:h1;together:t1;replicate:r1;nvidia:n1");
    expect(report.groupsFound).toBe(6);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.parsed).toEqual({ agnes: ["a1"], gemini: ["g1"], hf: ["h1"], together: ["t1"], replicate: ["r1"], nvidia: ["n1"] });
  });

  it("reports warnings for empty pools", () => {
    const report = parseImageKeyPoolsWithReport("agnes:a1");
    expect(report.warnings.length).toBe(0); // No warning since one pool has keys
  });

  it("reports warnings for empty input", () => {
    const report = parseImageKeyPoolsWithReport("");
    expect(report.warnings).toContain("IMAGE_API_KEYS is empty or not set");
  });
});

describe("parseIndividualEnvKeys", () => {
  it("parses comma-separated keys from individual env vars", () => {
    const pools = parseIndividualEnvKeys({
      HUGGINGFACE_API_KEY: "hf_key1,hf_key2",
      AGNES_API_KEY: "agnes_key1",
      TOGETHER_API_KEY: "together_key1,together_key2",
      REPLICATE_API_KEY: "rep_key1",
      NVIDIA_API_KEY: "nv_key1,nv_key2",
    });
    expect(pools.hf).toEqual(["hf_key1", "hf_key2"]);
    expect(pools.agnes).toEqual(["agnes_key1"]);
    expect(pools.together).toEqual(["together_key1", "together_key2"]);
    expect(pools.replicate).toEqual(["rep_key1"]);
    expect(pools.nvidia).toEqual(["nv_key1", "nv_key2"]);
    expect(pools.gemini).toEqual([]);
  });

  it("handles missing env vars gracefully", () => {
    const pools = parseIndividualEnvKeys({});
    expect(pools).toEqual({ agnes: [], gemini: [], hf: [], together: [], replicate: [], nvidia: [] });
  });

  it("trims whitespace and filters empty keys", () => {
    const pools = parseIndividualEnvKeys({
      HUGGINGFACE_API_KEY: " hf_key1 , , hf_key2 , ",
    });
    expect(pools.hf).toEqual(["hf_key1", "hf_key2"]);
  });

  it("deduplicates keys within a single env var", () => {
    const pools = parseIndividualEnvKeys({
      NVIDIA_API_KEY: "key1,key2,key1",
    });
    expect(pools.nvidia).toEqual(["key1", "key2"]);
  });

  it("ignores blank env vars", () => {
    const pools = parseIndividualEnvKeys({
      HUGGINGFACE_API_KEY: "",
      AGNES_API_KEY: "   ",
      TOGETHER_API_KEY: "tk1",
    });
    expect(pools.hf).toEqual([]);
    expect(pools.agnes).toEqual([]);
    expect(pools.together).toEqual(["tk1"]);
  });
});

describe("mergeKeyPools", () => {
  it("merges individual and legacy pools with deduplication", () => {
    const individual = { agnes: ["a1"], gemini: [], hf: ["h1"], together: [], replicate: [], nvidia: [] };
    const legacy = { agnes: ["a2"], gemini: ["g1"], hf: ["h1", "h2"], together: [], replicate: [], nvidia: [] };
    const merged = mergeKeyPools(individual, legacy);
    expect(merged.agnes).toEqual(["a1", "a2"]);
    expect(merged.gemini).toEqual(["g1"]);
    expect(merged.hf).toEqual(["h1", "h2"]); // h1 deduped
  });

  it("individual keys take priority (appear first)", () => {
    const individual = { agnes: ["priority_key"], gemini: [], hf: [], together: [], replicate: [], nvidia: [] };
    const legacy = { agnes: ["legacy_key"], gemini: [], hf: [], together: [], replicate: [], nvidia: [] };
    const merged = mergeKeyPools(individual, legacy);
    expect(merged.agnes[0]).toBe("priority_key");
  });
});

describe("image provider constants", () => {
  it("exposes canonical provider ids including nvidia", () => {
    expect(IMAGE_PROVIDER_IDS).toEqual(["agnes", "gemini", "hf", "together", "replicate", "nvidia"]);
  });

  it("maps all individual env vars to valid provider ids", () => {
    for (const providerId of Object.values(INDIVIDUAL_KEY_ENV_VARS)) {
      expect(IMAGE_PROVIDER_IDS).toContain(providerId);
    }
  });

  it("emptyImageKeyPools returns an independent object per call", () => {
    const a = emptyImageKeyPools();
    a.agnes.push("mutated");
    expect(emptyImageKeyPools().agnes).toEqual([]);
  });
});
