import { expect, test } from "@playwright/test";

const liveRoutes = [
  { path: "/", heading: /Your Competitors Are Growing|Dashboard/i },
  { path: "/clone-crush", heading: /Analyze & Create|Clone & Crush AI/i },
  { path: "/create", heading: /Create from a topic|TubeBot AI/i },
  { path: "/chat", heading: /Create from a topic|TubeBot AI/i },
  { path: "/voice", heading: /Voiceover Studio/i },
  { path: "/repurposer", heading: /Multi-Platform Repurposer/i },
  { path: "/analytics", heading: /Channel Analytics|Viral ROI/i },
  { path: "/seo", heading: /SEO Tag|Competitor Optimizer/i },
  { path: "/library", heading: /Library/i },
  { path: "/rewards", heading: /Earn Pro|Referral/i },
  { path: "/settings", heading: /Settings/i },
];

test.describe("Phase 8 — live product routes", () => {
  for (const route of liveRoutes) {
    test(`${route.path} renders the application shell`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.locator("#main-content")).toBeVisible();
      await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
      await expect(page.locator("aside[aria-label='Primary navigation']")).toBeVisible();
    });
  }
});

test.describe("Phase 8 — mobile shell and route access", () => {
  test("keeps primary mobile destinations labeled", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByText("Dashboard", { exact: true })).toBeVisible();
    await expect(navigation.getByText("Analyze", { exact: true })).toBeVisible();
    await expect(navigation.getByText("Voiceover", { exact: true })).toBeVisible();
    await expect(navigation.getByText("Repurpose", { exact: true })).toBeVisible();
    await expect(navigation.getByText("More", { exact: true })).toBeVisible();
  });

  test("exposes Library and topic creation from the mobile More menu", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    await page.getByRole("button", { name: "Open more navigation options" }).click();
    await expect(page.getByRole("button", { name: /Library.*saved content/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create from topic.*titles/i })).toBeVisible();
  });

  test("keeps the document within the mobile viewport on the Library route", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/library");

    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  });
});
