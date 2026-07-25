/**
 * Vitest configuration.
 *
 * - Unit/integration suites are co-located with their modules in
 *   `packages/**` and `src/**`, plus cross-cutting suites in `tests/`.
 * - End-to-end tests live under `e2e/` and are executed by Playwright
 *   (see `e2e/playwright.config.ts`); they are excluded here so Vitest
 *   never tries to run them as unit tests.
 * - The `@/*` path alias mirrors Vite so tests import app modules
 *   exactly the way the application does.
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
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "packages/**/*.test.ts",
      "src/**/*.test.{ts,tsx}",
    ],
    exclude: ["e2e/**", "**/node_modules/**", "dist/**", "docs/**"],
  },
});
