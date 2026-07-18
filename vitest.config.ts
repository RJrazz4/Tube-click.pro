/**
 * Phase A0 — Vitest unit-test scope.
 *
 * Unit/integration suites live in tests/, packages/ and src/ (lands with
 * Phase A1/A2 key-pool suites, Phase D rotation tests, Phase H hardening).
 * e2e/ is owned by Playwright (separate runner) and must never be picked
 * up by vitest.
 *
 * The "@" alias mirrors vite.config.ts so src/ suites import app modules
 * exactly as the app does.
 */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: [
      "tests/**/*.test.ts",
      "packages/**/*.test.ts",
      "src/**/*.test.{ts,tsx}",
    ],
    exclude: ["e2e/**", "**/node_modules/**", "dist/**", "docs/**"],
  },
});
