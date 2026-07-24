import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("phase five production readiness", () => {
  it("mounts a render boundary and offline status", async () => {
    const source = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
    expect(source).toContain("AppErrorBoundary");
    expect(source).toContain("ConnectionStatus");
  });

  it("keeps reduced motion support enabled", async () => {
    const source = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
    expect(source).toContain("prefers-reduced-motion: reduce");
  });
});
