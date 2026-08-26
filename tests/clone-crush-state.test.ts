import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const storage = new MemoryStorage();
const root = new URL("..", import.meta.url).pathname;
let storeModule: typeof import("../src/stores/useCloneCrushStore");

function video(videoId: string, title = videoId) {
  return {
    videoId,
    title,
    channelName: "Test channel",
    views: "100K",
    viewsCount: 100_000,
    publishedAt: "2026-08-16T00:00:00.000Z",
    thumbnail: `https://example.com/${videoId}.jpg`,
    url: `https://youtube.com/watch?v=${videoId}`,
  };
}

beforeAll(async () => {
  vi.stubGlobal("localStorage", storage);
  storeModule = await import("../src/stores/useCloneCrushStore");
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  storage.clear();
  vi.restoreAllMocks();
  storeModule.useCloneCrushStore.getState().clearAll();
});

describe("Clone & Crush persisted Free channel lock", () => {
  it("preserves a draft until submission and then rejects every different Free URL", () => {
    const store = storeModule.useCloneCrushStore;

    expect(store.getState().setChannelDraft("https://youtube.com/@first", "free")).toEqual({ ok: true });
    expect(store.getState().channelDraft).toBe("https://youtube.com/@first");
    expect(store.getState().freeLockedChannelUrl).toBeNull();

    expect(store.getState().submitChannelUrl("https://youtube.com/@first/", "free")).toMatchObject({
      ok: true,
      url: "https://youtube.com/@first/",
    });
    expect(store.getState().freeLockedChannelUrl).toBe("https://youtube.com/@first/");

    expect(store.getState().setChannelDraft("https://youtube.com/@second", "free")).toEqual({
      ok: false,
      reason: "URL_LOCKED",
    });
    expect(store.getState().submitChannelUrl("https://youtube.com/@second", "free")).toEqual({
      ok: false,
      reason: "URL_LOCKED",
    });
    expect(store.getState().channelDraft).toBe("https://youtube.com/@first/");
    expect(store.getState().freeLockedChannelUrl).toBe("https://youtube.com/@first/");
  });

  it("allows Pro replacement while retaining the original Free lock for downgrade safety", () => {
    const store = storeModule.useCloneCrushStore;
    store.getState().submitChannelUrl("@first", "free");

    expect(store.getState().submitChannelUrl("@second", "pro")).toMatchObject({ ok: true, url: "@second" });
    expect(store.getState().channelDraft).toBe("@second");
    expect(store.getState().freeLockedChannelUrl).toBe("@first");
  });

  it("persists both draft and lock in the version 8 partial state", () => {
    const store = storeModule.useCloneCrushStore;
    store.getState().submitChannelUrl("@persisted", "free");

    const partialize = store.persist.getOptions().partialize!;
    const persisted = partialize(store.getState()) as Record<string, unknown>;

    expect(store.persist.getOptions().version).toBe(8);
    expect(persisted.channelDraft).toBe("@persisted");
    expect(persisted.freeLockedChannelUrl).toBe("@persisted");
  });

  it("migrates a previously submitted slot-zero channel into the Free lock", async () => {
    const migrate = storeModule.useCloneCrushStore.persist.getOptions().migrate!;
    const migrated = await migrate({
      savedChannels: [{
        slotIndex: 0,
        url: "https://youtube.com/@legacy",
        handle: "@legacy",
        name: "Legacy",
        avatar: "",
        niche: null,
        savedAt: "2026-08-15T00:00:00.000Z",
      }],
      competitors: [],
    }, 6) as Record<string, unknown>;

    expect(migrated.channelDraft).toBe("https://youtube.com/@legacy");
    expect(migrated.freeLockedChannelUrl).toBe("https://youtube.com/@legacy");
  });

  it("preserves an unsubmitted legacy draft without turning it into a Free lock", async () => {
    const migrate = storeModule.useCloneCrushStore.persist.getOptions().migrate!;
    const migrated = await migrate({
      channelDraft: "https://youtube.com/@draft-only",
      competitors: [],
    }, 7) as Record<string, unknown>;

    expect(migrated.channelDraft).toBe("https://youtube.com/@draft-only");
    expect(migrated.freeLockedChannelUrl).toBeNull();
  });
});

describe("Clone & Crush output language", () => {
  it("persists exactly English, Hindi, or Hinglish without changing the Free URL lock", async () => {
    const store = storeModule.useCloneCrushStore;
    store.getState().submitChannelUrl("@language-locked", "free");

    store.getState().setOutputLanguage("Hinglish");
    expect(store.getState().outputLanguage).toBe("Hinglish");
    expect(store.getState().freeLockedChannelUrl).toBe("@language-locked");

    const partialize = store.persist.getOptions().partialize!;
    const persisted = partialize(store.getState()) as Record<string, unknown>;
    expect(persisted.outputLanguage).toBe("Hinglish");

    const migrate = store.persist.getOptions().migrate!;
    const migrated = await migrate({ outputLanguage: "unsupported", competitors: [] }, 7) as Record<string, unknown>;
    expect(migrated.outputLanguage).toBe("English");
    expect(storeModule.normalizeCloneCrushOutputLanguage("Hindi")).toBe("Hindi");
    expect(storeModule.normalizeCloneCrushOutputLanguage("hinglish")).toBe("English");
  });

  it("renders only the three language choices and carries the preference through auth and API requests", async () => {
    const source = await readFile(join(root, "src/pages/CloneCrush.tsx"), "utf8");

    expect(source.match(/<SelectItem value=/g)).toHaveLength(3);
    expect(source).toContain('<SelectItem value="English">English</SelectItem>');
    expect(source).toContain('<SelectItem value="Hindi">Hindi</SelectItem>');
    expect(source).toContain('<SelectItem value="Hinglish">Hinglish</SelectItem>');
    expect(source).toMatch(/\| "outputLanguage"/);
    expect(source).toContain("outputLanguage: state.outputLanguage");
    expect(source).toContain("language: outputLanguage");
  });
});

describe("Clone & Crush tier and authentication routing", () => {
  it("authenticates Free execution without sending AUTH_REQUIRED to the Premium paywall", async () => {
    const source = await readFile(join(root, "src/pages/CloneCrush.tsx"), "utf8");

    expect(source).toMatch(/if \(code === "AUTH_REQUIRED" \|\| status === 401\)/);
    expect(source).toMatch(/requestAuthentication\("complete your Free Chain-Loop"\)/);
    expect(source).toContain("PENDING_AUTH_WORKFLOW_KEY");
    expect(source).toContain("restorePendingAuthWorkflow");
    expect(source).toMatch(/if \(code === "PRO_REQUIRED" \|\| \(status === 403 && requestedTier === "premium"\)\)/);
    expect(source).not.toMatch(/AUTH_REQUIRED" \|\| code === "PRO_REQUIRED"/);
    expect(source).not.toContain('throw new Error("This request could not be authorized. Please refresh and try again.")');
    expect(source).toContain('toast.error("This request could not be authorized. Please refresh and try again."');
  });

  it("waits for explicit entitlement readiness and keeps locked teaser tiles clickable", async () => {
    const pageSource = await readFile(join(root, "src/pages/CloneCrush.tsx"), "utf8");
    const gateSource = await readFile(join(root, "src/contexts/SoftGateContext.tsx"), "utf8");

    expect(gateSource).toContain("isEntitlementLoading");
    expect(gateSource).toContain("isEntitlementVerified");
    expect(gateSource).toContain("sessionSyncGenerationRef");
    const syncSession = gateSource.slice(
      gateSource.indexOf("const syncSession"),
      gateSource.indexOf("useEffect", gateSource.indexOf("const syncSession")),
    );
    expect(syncSession.indexOf("finishPending(true)")).toBeGreaterThan(
      syncSession.indexOf("await loadTrialEntitlement()"),
    );
    expect(pageSource).toMatch(/const isTierReady = !isAuthLoading && !isEntitlementLoading/);
    expect(pageSource).toContain("const userIsPro = canUsePremium();");
    expect(pageSource).toContain("if (!userIsPro && isFreeConveyorActive)");
    expect(pageSource).toContain("if (!isPro) return competitors[0] ?? null;");
    expect(pageSource).toContain('${tileLocked?"opacity-80":""}');
    expect(pageSource).not.toContain('${tileLocked?"pointer-events-none":"cursor-pointer"}');
  });
});

describe("Clone & Crush Free conveyor", () => {
  it("shows one active slot, keeps its original deadline on consume, then promotes with a fresh 24h timer", () => {
    const now = new Date("2026-08-16T06:00:00.000Z").getTime();
    let clock = now;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const store = storeModule.useCloneCrushStore;

    store.getState().setCompetitors([video("one"), video("two"), video("three")]);
    store.getState().startFreeConveyorTimer(10_000);

    expect(store.getState().conveyorQueue.map((item) => item.isLocked)).toEqual([false, true, true]);
    expect(store.getState().freeCooldownUntil).toBe(now + 10_000);
    expect(store.getState().freeLockedVideoId).toBeNull();

    clock = now + 2_000;
    store.getState().startFreeCooldown("one");
    expect(store.getState().freeCooldownUntil).toBe(now + 10_000);
    expect(store.getState().freeLockedVideoId).toBe("one");

    clock = now + 10_001;
    store.getState().expireFreeCooldownCycle();

    const promoted = store.getState();
    expect(promoted.conveyorQueue.map((item) => item.videoId)).toEqual(["two", "three"]);
    expect(promoted.conveyorQueue.map((item) => item.isLocked)).toEqual([false, true]);
    expect(promoted.activeVideoId).toBe("two");
    expect(promoted.freeLockedVideoId).toBeNull();
    expect(promoted.freeCooldownUntil).toBe(now + 10_001 + storeModule.FREE_COOLDOWN_MS);
    expect(promoted.conveyorShiftPending).toBe(true);

    const persisted = store.persist.getOptions().partialize!(promoted) as Record<string, unknown>;
    expect(persisted.conveyorShiftPending).toBe(true);
  });

  it("starts a fresh 24-hour timer when refill creates Slot 1 after a short queue expires", () => {
    const now = new Date("2026-08-16T06:00:00.000Z").getTime();
    let clock = now;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const store = storeModule.useCloneCrushStore;

    store.getState().setCompetitors([video("only")]);
    store.getState().startFreeConveyorTimer(10_000);
    clock = now + 10_001;
    store.getState().expireFreeCooldownCycle();

    expect(store.getState().conveyorQueue).toHaveLength(0);
    expect(store.getState().freeCooldownUntil).toBeNull();
    expect(store.getState().conveyorShiftPending).toBe(true);

    store.getState().appendConveyorTile(video("refill") as any);
    expect(store.getState().conveyorQueue.map((item) => item.videoId)).toEqual(["refill"]);
    expect(store.getState().freeCooldownUntil).toBe(clock + storeModule.FREE_COOLDOWN_MS);
  });

  it("keeps a failed or empty refill pending and only announces a real append", async () => {
    const source = await readFile(join(root, "src/pages/CloneCrush.tsx"), "utf8");
    const refill = source.slice(
      source.indexOf("// Case A: cooldown expired"),
      source.indexOf("// Case B: returning user"),
    );

    expect(refill).toContain("if (conveyorShiftPending && !isFreeCooldownActive && !isPro)");
    expect(refill).not.toContain("conveyorShiftPending && profile");
    expect(source).toContain("if (useCloneCrushStore.getState().conveyorQueue.length > 0) return;");
    expect(refill).toContain('if (!fresh) throw new Error("No fresh analysis available — try again in a moment")');
    expect(refill).toMatch(/appendConveyorTile\([\s\S]*markConveyorShiftConsumed\(\)[\s\S]*toast\.success/);
    expect(refill).toContain("conveyorRetryBlockedRef.current = true");
    const refillCatch = refill.slice(refill.indexOf(".catch((error: unknown)"));
    expect(refillCatch).not.toContain("markConveyorShiftConsumed()");
  });
});
