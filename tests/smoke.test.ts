/**
 * Toolchain smoke tests.
 *
 * Sanity checks that verify the Vitest runner is wired into CI and that
 * fundamental environment/runtime invariants hold.
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
