/**
 * Phase 5 — E2E Test Configuration
 *
 * Playwright config for testing the Storyboard and Thumbnail UIs
 * against the Phase 4 API routes.
 *
 * Usage:
 *   npx playwright test --config e2e/playwright.config.ts
 *
 * Requirements:
 *   - Playwright installed: npm install -D @playwright/test
 *   - Browsers installed: npx playwright install chromium
 *   - Dev server running: npm run dev
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/specs",
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 720 },
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    port: 5173,
    reuseExistingServer: true,
  },
});
