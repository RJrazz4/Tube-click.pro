/**
 * Phase A0 — Vitest unit-test scope.
 *
 * Unit/integration suites live in tests/, packages/ and src/ (lands with
 * Phase A1/A2 key-pool suites, Phase D rotation tests, Phase H hardening).
 * e2e/ is owned by Playwright (separate runner) and must never be picked
 * up by vitest.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.test.ts",
      "packages/**/*.test.ts",
      "src/**/*.test.{ts,tsx}",
    ],
    exclude: ["e2e/**", "**/node_modules/**", "dist/**", "docs/**"],
  },
});
