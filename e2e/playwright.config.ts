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

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  // Paths are resolved relative to this config file in /e2e.
  testDir: "./specs",
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 720 } } },
    { name: "mobile-chromium", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "npm run dev -- --host 0.0.0.0",
    port: 8080,
    reuseExistingServer: true,
  },
});
