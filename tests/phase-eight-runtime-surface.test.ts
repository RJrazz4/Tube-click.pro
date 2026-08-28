import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/pages/Settings.tsx", import.meta.url), "utf8");
const exportSource = readFileSync(new URL("../src/lib/export.ts", import.meta.url), "utf8");
const librarySource = readFileSync(new URL("../src/pages/Library.tsx", import.meta.url), "utf8");

const LIVE_ROUTES = [
  "/",
  "/clone-crush",
  "/create",
  "/chat",
  "/voice",
  "/repurposer",
  "/analytics",
  "/seo",
  "/library",
  "/rewards",
  "/settings",
  "/about",
  "/privacy",
  "/terms",
];

describe("Phase 8 — active product surface", () => {
  it("keeps every user-facing route registered in the SPA", () => {
    for (const route of LIVE_ROUTES) {
      expect(appSource).toContain(`path="${route}"`);
    }
  });

  it("keeps the public route aliases for topic creation", () => {
    expect(appSource).toContain('path="/create"');
    expect(appSource).toContain('path="/chat"');
    expect(appSource).toContain('const ChatAgent = lazy');
  });

  it("uses a device-width viewport so mobile breakpoints can activate", () => {
    expect(indexSource).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(indexSource).not.toContain('name="viewport" content="width=1280"');
  });

  it("keeps the Library backed by the existing local content store", () => {
    expect(librarySource).toContain("useContentStore");
    expect(librarySource).toContain("Save");
    expect(librarySource).toContain("Download");
    expect(librarySource).toContain("Filter saved content");
    expect(appSource).toContain('path="/library"');
  });

  it("exports current app state without reading obsolete unnamespaced content keys", () => {
    expect(settingsSource).toContain("useContentStore.getState()");
    expect(settingsSource).toContain("useCloneCrushStore.getState()");
    expect(settingsSource).toContain("useWorkflowStore.getState()");
    expect(settingsSource).not.toContain('localStorage.getItem("tubegenius-content-store")');
    expect(settingsSource).not.toContain('localStorage.getItem("tubegenius-app-store")');
  });

  it("keeps repurposed content exportable in the ZIP manifest and folder structure", () => {
    expect(exportSource).toContain("case 'repurposed'");
    expect(exportSource).toContain("zip.folder('repurposed')");
    expect(exportSource).toContain("counts.repurposed");
  });

  it("clears namespaced app data while preserving namespaced auth storage", () => {
    expect(settingsSource).toContain('key.startsWith("tc:u:")');
    expect(settingsSource).toContain("AUTH_NAMESPACED_PREFIX");
    expect(settingsSource).toContain("!key.startsWith(AUTH_NAMESPACED_PREFIX)");
  });
});
