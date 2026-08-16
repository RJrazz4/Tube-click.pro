/**
 * Clone & Crush browser regression matrix.
 *
 * These tests seed only the persisted guest store. Network-backed profiling and
 * rewrite authorization have separate API tests; this file protects the UI
 * contract around drafts, immutable Free URLs, paywall CTAs, and conveyor
 * expiry without depending on YouTube or an authenticated account.
 */

import { test, expect, type Page } from "@playwright/test";

const STORE_KEY = "tc:u:tubegenius-clone-crush-store:guest";

function video(videoId: string, title: string) {
  return {
    id: videoId,
    videoId,
    title,
    url: `https://youtube.com/watch?v=${videoId}`,
    thumbnail: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
    views: "1.2M views",
    viewsCount: 1_200_000,
    publishedAt: "2026-08-15T00:00:00.000Z",
    publishedDate: "Aug 15, 2026",
    channelName: "Viral Creator",
    isLocked: false,
    viralVelocityScore: 88,
  };
}

function persistedWorkspace(unlocksAt: number) {
  const queue = [
    video("video-one", "Active Video One"),
    video("video-two", "Upcoming Video Two"),
    video("video-three", "Upcoming Video Three"),
  ];
  const channelUrl = "https://youtube.com/@locked-channel";
  return {
    profile: {
      id: "locked-channel",
      url: channelUrl,
      name: "Locked Channel",
      handle: "@locked-channel",
      avatar: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
      banner: "",
      description: "Technology tutorials and software",
      profiledAt: "2026-08-15T00:00:00.000Z",
    },
    savedChannels: [{
      slotIndex: 0,
      url: channelUrl,
      handle: "@locked-channel",
      name: "Locked Channel",
      avatar: "",
      niche: "Tech & Coding",
      savedAt: "2026-08-15T00:00:00.000Z",
    }],
    activeSlotIndex: 0,
    savedNiche: "Tech & Coding",
    channelDraft: channelUrl,
    freeLockedChannelUrl: channelUrl,
    conveyorQueue: queue,
    competitors: queue,
    activeVideoId: "video-one",
    freeCooldownUntil: unlocksAt,
    freeLockedVideoId: null,
    seenVideoIds: queue.map((item) => item.videoId),
  };
}

async function seedGuestStore(page: Page, state: Record<string, unknown>) {
  await page.goto("/clone-crush");
  await page.evaluate(({ key, value }) => {
    localStorage.removeItem("tc:last-auth-user-id");
    localStorage.setItem(key, JSON.stringify({ state: value, version: 8 }));
  }, { key: STORE_KEY, value: state });
  await page.reload();
  await expect(page.getByRole("heading", { name: /Clone & Crush AI/i })).toBeVisible();
}

test.describe("Clone & Crush — persisted Free workspace", () => {
  test("preserves an unsubmitted URL draft across focus changes and reloads", async ({ page }) => {
    await page.goto("/clone-crush");
    const input = page.getByRole("textbox", { name: "YouTube Channel URL or Handle" });
    await expect(input).toBeEditable();

    await input.fill("@NvidiaDeveloper");
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    await expect(input).toHaveValue("@NvidiaDeveloper");

    await page.reload();
    await expect(page.getByRole("textbox", { name: "YouTube Channel URL or Handle" })).toHaveValue("@NvidiaDeveloper");
    // A persisted draft is presentation state only; it must not auto-profile.
    await expect(page.getByText("Your Channel • Ghost Verified")).toHaveCount(0);
  });

  test("persists the selected output language without profiling or changing the URL state", async ({ page }) => {
    await page.goto("/clone-crush");
    const selector = page.getByRole("combobox", { name: "Output Language" });
    await expect(selector).toContainText("English");

    await selector.click();
    await page.getByRole("option", { name: "Hinglish" }).click();
    await expect(selector).toContainText("Hinglish");

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Output Language" })).toContainText("Hinglish");
    await expect(page.getByText("Your Channel • Ghost Verified")).toHaveCount(0);
  });

  test("keeps the submitted Free URL read-only and routes its mutation CTA to the channel upsell", async ({ page }) => {
    const channelUrl = "https://youtube.com/@locked-channel";
    await seedGuestStore(page, {
      channelDraft: channelUrl,
      freeLockedChannelUrl: channelUrl,
    });

    const input = page.getByRole("textbox", { name: "YouTube Channel URL or Handle" });
    await expect(input).toHaveValue(channelUrl);
    await expect(input).toHaveAttribute("readonly", "");

    await page.getByRole("button", { name: /Free URL locked/i }).click();
    await expect(page).toHaveURL(/\/rewards\?upsell=clonecrush-channel&tier=pro$/);
  });

  test("exposes one active result, labels later slots NEXT • LOCKED, and keeps Premium CTAs clickable", async ({ page }) => {
    await seedGuestStore(page, persistedWorkspace(Date.now() + 60 * 60 * 1000));

    await expect(page.getByText("SLOT 1 • ACTIVE", { exact: true })).toHaveCount(1);
    await expect(page.getByText("NEXT • LOCKED", { exact: true })).toHaveCount(2);
    await expect(page.getByText(/SLOT 1 • 00:59:/)).toBeVisible();

    await page.getByRole("button", { name: /Skip Wait — Pro/i }).first().click();
    await expect(page).toHaveURL(/\/rewards\?upsell=clonecrush&tier=99glitch$/);

    await page.goBack();
    await expect(page.getByText("NEXT • LOCKED", { exact: true })).toHaveCount(2);
    await page.getByText("Upcoming Video Two", { exact: true }).click();
    await expect(page).toHaveURL(/\/rewards\?upsell=clonecrush&tier=locked$/);
  });

  test("evicts expired Slot 1 and promotes Slot 2 with a fresh 24-hour window", async ({ page }) => {
    await seedGuestStore(page, persistedWorkspace(Date.now() + 1_200));

    await expect(page.getByText("Active Video One", { exact: true })).toBeVisible();
    await expect(page.getByText("Upcoming Video Two", { exact: true })).toBeVisible();

    await expect(page.getByText("Active Video One", { exact: true })).toHaveCount(0, { timeout: 5_000 });
    const activeTile = page.locator("div.cursor-pointer").filter({
      has: page.getByText("SLOT 1 • ACTIVE", { exact: true }),
    });
    await expect(activeTile).toContainText("Upcoming Video Two");
    await expect(activeTile).toContainText(/SLOT 1 • 23:59:/);
    await expect(page.getByText("NEXT • LOCKED", { exact: true })).toHaveCount(1);
  });
});
