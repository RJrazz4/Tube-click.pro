/**
 * Phase 5 — E2E: API Tier Enforcement
 *
 * Directly tests the Phase 4 API endpoints without the UI layer,
 * verifying that server-side tier enforcement works correctly.
 *
 * Dependencies: Phase 4 API running at VITE_API_BASE
 *
 * Usage:
 *   VITE_API_BASE=https://your-app.vercel.app npx playwright test --config e2e/playwright.config.ts e2e/specs/api-tier-enforcement.spec.ts
 *
 * Or against the local dev server:
 *   npx playwright test --config e2e/playwright.config.ts e2e/specs/api-tier-enforcement.spec.ts
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.VITE_API_BASE || "http://localhost:5173/api/v1";

test.describe("API — Tier Enforcement (Phase 4)", () => {
  test("POST /v1/storyboard — free tier truncates to 4 scenes", async ({ request }) => {
    const scenes = Array.from({ length: 10 }, (_, i) => ({
      scene_number: i + 1,
      visual_prompt: `Scene ${i + 1}: A person walking in the park`,
      duration: 5,
      transition: "cut" as const,
      beat_type: (i === 0 ? "intro" : i === 9 ? "outro" : "content") as
        | "intro"
        | "hook"
        | "content"
        | "climax"
        | "outro",
    }));

    const response = await request.post(`${API_BASE}/storyboard`, {
      data: {
        topic: "Test",
        scenes,
        tier: "free",
        brand: "Tube.Flash",
        aspect_ratio: "16:9",
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    // Free tier should have max 4 scenes
    expect(body.data.total_scenes).toBeLessThanOrEqual(4);
    expect(body.data.requested_scenes).toBe(10);
    expect(body.data.truncated).toBe(true);

    // Upgrade message should be present
    expect(body.data.upgrade_message).toBeTruthy();
    expect(body.data.upgrade_message).toContain("Free plan");

    // Limits should be in the response
    expect(body.data.lims?.max_scenes).toBe(4);
  });

  test("POST /v1/storyboard — premium tier allows unlimited scenes", async ({ request }) => {
    const scenes = Array.from({ length: 8 }, (_, i) => ({
      scene_number: i + 1,
      visual_prompt: `Scene ${i + 1}: Cinematic shot of city skyline`,
      duration: 5,
      transition: "dissolve" as const,
      beat_type: "content" as const,
    }));

    const response = await request.post(`${API_BASE}/storyboard`, {
      data: {
        topic: "Premium Test",
        scenes,
        tier: "premium",
        brand: "Tube.Cinematic",
        aspect_ratio: "16:9",
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    // Premium should keep all scenes
    expect(body.data.total_scenes).toBe(8);
    expect(body.data.truncated).toBe(false);
  });

  test("POST /v1/thumbnail — free tier clamps count and brand", async ({ request }) => {
    const response = await request.post(`${API_BASE}/thumbnail`, {
      data: {
        title: "Free Tier Test",
        emotion: "Exciting",
        style: "Modern",
        aspect_ratio: "16:9",
        count: 4,
        tier: "free",
        brand: "Tube.Cinematic", // Not allowed on free tier
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    // Clamped to max 2 for free
    expect(body.data.total_generated).toBeLessThanOrEqual(2);
    expect(body.data.truncated).toBe(true);
    expect(body.data.requested).toBe(4);

    // Brand should be downgraded to Tube.Flash
    expect(body.data.brand).toBe("Tube.Flash");
  });

  test("POST /v1/thumbnail — premium tier allows 4 thumbnails with any brand", async ({ request }) => {
    const response = await request.post(`${API_BASE}/thumbnail`, {
      data: {
        title: "Premium Test",
        emotion: "Cinematic",
        style: "Dark",
        aspect_ratio: "16:9",
        count: 4,
        tier: "premium",
        brand: "Tube.Cinematic",
      },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    // Should aim for 4 (may get less if generation fails, but request should not be clamped)
    expect(body.data.truncated).toBe(false);
    expect(body.data.brand).toBe("Tube.Cinematic");
  });

  test("POST /v1/storyboard — validation rejects empty body", async ({ request }) => {
    const response = await request.post(`${API_BASE}/storyboard`, {
      data: {},
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.fields).toBeDefined();
    expect(body.fields.length).toBeGreaterThan(0);
  });
});
