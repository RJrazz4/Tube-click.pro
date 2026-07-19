/**
 * Phase 4 & 5 — E2E: Clone & Crush Auto-Competitor Matrix
 * 
 * Verifies that the Clone & Crush workspace page renders correctly,
 * inputs are interactive, and the subscription upgrade logic functions
 * smoothly in real-time.
 */

import { test, expect } from "@playwright/test";

test.describe("Clone & Crush — Workspace & Gating Matrix", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/clone-crush");
  });

  test("renders main workspace headers and descriptors", async ({ page }) => {
    // Page title and badges should be present
    const header = page.locator("h1:has-text('Clone & Crush AI')");
    await expect(header).toBeAttached({ timeout: 5000 });

    const badge = page.locator("text=Auto-Competitor Matrix");
    await expect(badge).toBeAttached();
  });

  test("allows typing a YouTube channel URL or handle", async ({ page }) => {
    const input = page.locator("input[placeholder*='YouTube Channel URL']");
    await expect(input).toBeAttached();

    // Type a handle
    await input.fill("@NvidiaDeveloper");
    await expect(input).toHaveValue("@NvidiaDeveloper");
  });

  test("gating logic updates subscription badge on real-time upgrade click", async ({ page }) => {
    // Initial badge should show "free Plan" or similar
    const initialBadge = page.locator("p:has-text('free Plan')");
    await expect(initialBadge).toBeAttached();

    // Find and click the Upgrade button
    const upgradeBtn = page.locator("button:has-text('Upgrade Pro')");
    await expect(upgradeBtn).toBeAttached();
    await upgradeBtn.click();

    // Badge should update to "pro Plan"
    const updatedBadge = page.locator("p:has-text('pro Plan')");
    await expect(updatedBadge).toBeAttached();
  });
});
