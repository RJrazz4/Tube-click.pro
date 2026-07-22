import { expect, test } from "@playwright/test";

const mobileViewports = [
  { name: "320px", width: 320, height: 568 },
  { name: "375px", width: 375, height: 667 },
  { name: "428px", width: 428, height: 926 },
] as const;

for (const viewport of mobileViewports) {
  test(`mobile shell is usable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.locator("aside[aria-label], aside")).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      mainLeft: document.querySelector("#main-content")?.getBoundingClientRect().left ?? -1,
      navBottom: document.querySelector("aside")?.getBoundingClientRect().bottom ?? -1,
      viewportHeight: window.innerHeight,
    }));

    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.mainLeft).toBe(0);
    expect(dimensions.navBottom).toBeGreaterThanOrEqual(dimensions.viewportHeight - 1);
  });
}
