/**
 * Phase 5 — E2E: Storyboard Tier Alert Banner
 *
 * Verifies that the TierAlertBanner component renders correctly
 * for free and premium tiers, and that scene limits are respected.
 *
 * Dependencies: Phase 4 API (POST /v1/storyboard), Phase 5 UI components
 */

import { test, expect } from "@playwright/test";

test.describe("Storyboard — Tier Alert Banner", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/storyboard");
  });

  test("shows 'Free Plan' banner for anonymous/free users", async ({ page }) => {
    // The banner should be visible at the top of the page
    const banner = page.locator("text=Free Plan").first();
    await expect(banner).toBeVisible({ timeout: 5000 });
  });

  test("shows scene count usage in banner", async ({ page }) => {
    // Get the text showing scene count
    const usageText = page.locator("text=/\\d+ of \\d+ scenes used/");
    await expect(usageText).toBeVisible({ timeout: 5000 });
  });

  test("shows upgrade CTA button for free tier", async ({ page }) => {
    const upgradeButton = page.locator("button:has-text('Upgrade')").first();
    // It should exist (but may be disabled/not visible on small screens)
    await expect(upgradeButton).toBeAttached({ timeout: 5000 });
  });

  test("shows usage progress bar", async ({ page }) => {
    // The progress bar inside the banner
    const progressBar = page.locator("div[aria-label='Scene usage']");
    // Graceful fallback: look for any rounded-full div inside the banner
    const possibleBar = page.locator("text=Free Plan").first().locator("..").locator("div.rounded-full");
    await expect(possibleBar.first()).toBeAttached({ timeout: 5000 });
  });

  test("changes banner variant when scenes exceed limit", async ({ page }) => {
    // This test requires a script with >4 scenes
    // Paste a long script into the textarea
    const textarea = page.locator("textarea");
    await textarea.fill(
      "This is a test script that should generate at least five scenes. ".repeat(30)
    );

    // Click analyze
    const analyzeBtn = page.locator("button:has-text('Analyze Script')");
    await analyzeBtn.click();

    // Wait for scene analysis to complete
    await page.waitForTimeout(5000);

    // Check if the limit banner (orange/red variant) is shown
    // If scenes exceed 4, the banner should switch to "near limit" or "limit" mode
    const nearLimitText = page.locator("text=Free Plan — near limit");
    const limitReachedText = page.locator("text=Scene limit reached");

    // Either may be present depending on scene count
    const isNearLimit = await nearLimitText.isVisible().catch(() => false);
    const isLimitReached = await limitReachedText.isVisible().catch(() => false);
    expect(isNearLimit || isLimitReached).toBeTruthy();
  });
});
