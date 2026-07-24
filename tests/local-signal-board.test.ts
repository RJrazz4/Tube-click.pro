import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("local signal board", () => {
  it("labels signals as local patterns and avoids unsupported live claims", async () => {
    const source = await readFile(new URL("../src/components/intelligence/LocalSignalBoard.tsx", import.meta.url), "utf8");
    expect(source).toContain("LOCAL PATTERN SIGNAL");
    expect(source).toContain("not live market data");
    expect(source).not.toMatch(/real-time views|guaranteed views|live market ticker/i);
  });
});
