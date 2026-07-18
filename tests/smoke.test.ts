/**
 * Phase A0 — Toolchain smoke test.
 *
 * Proves the vitest runner is wired into the CI gate. Real suites arrive
 * with their owning phases (A1 env schema, A2 key pool, D rotation, …).
 */
import { describe, expect, it } from "vitest";

describe("phase-a0 toolchain smoke", () => {
  it("vitest is installed and executing suites", () => {
    expect(1 + 1).toBe(2);
  });

  it("resolves workspace source files", async () => {
    const tier = await import("../packages/shared/tier");
    expect(tier).toBeTypeOf("object");
  });
});
