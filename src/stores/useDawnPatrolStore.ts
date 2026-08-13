/**
 * src/stores/useDawnPatrolStore.ts — Dawn Patrol UI state.
 *
 * Per-user persisted store tracking the latest Dawn Patrol briefs,
 * unread count, and generation/loading flags. Polls lazily from the
 * Dashboard (5m interval) and on app focus; markRead flips a brief's
 * read_at timestamp via API.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createPerUserStorage } from "@/lib/storage/perUserStorage";
import { useAuthStore } from "./useAuthStore";

export interface DawnBrief {
  id: string;
  brief_date: string;
  headline: string;
  bullets: string[];
  opportunities: string[];
  threats: string[];
  competitor_delta: Record<string, any>;
  niche_snapshot: string | null;
  delivery_channel: string;
  email_status: string | null;
  model: string | null;
  read_at: string | null;
  created_at: string;
}

interface DawnConfig {
  enabled: boolean;
  send_hour: number;
}

interface DawnState {
  briefs: DawnBrief[];
  latest: DawnBrief | null;
  unreadCount: number;
  generating: boolean;
  loading: boolean;
  error: string | null;
  config: DawnConfig | null;
  hydrate: (briefs: DawnBrief[]) => void;
  setGenerating: (on: boolean) => void;
  setLoading: (on: boolean) => void;
  setError: (msg: string | null) => void;
  setConfig: (cfg: DawnConfig) => void;
  markReadLocal: (id: string) => void;
  getUnreadCount: () => number;
}

function computeUnread(list: DawnBrief[]): number {
  return list.filter((b) => !b.read_at).length;
}

const STORAGE_KEY = "tubeclick:dawn-patrol:v1";

export const useDawnPatrolStore = create<DawnState>()(
  persist(
    (set, get) => ({
      briefs: [],
      latest: null,
      unreadCount: 0,
      generating: false,
      loading: false,
      error: null,
      config: null,
      hydrate: (briefs) => {
        const sorted = [...briefs].sort((a, b) => (a.brief_date < b.brief_date ? 1 : -1));
        set({
          briefs: sorted,
          latest: sorted[0] ?? null,
          unreadCount: computeUnread(sorted),
          loading: false,
          generating: false,
          error: null,
        });
      },
      setGenerating: (on) => set({ generating: on, error: null }),
      setLoading: (on) => set({ loading: on, error: null }),
      setError: (msg) => set({ error: msg, loading: false, generating: false }),
      setConfig: (cfg) => set({ config: cfg }),
      markReadLocal: (id) => {
        const briefs = get().briefs.map((b) =>
          b.id === id ? { ...b, read_at: b.read_at ?? new Date().toISOString() } : b,
        );
        set({ briefs, latest: briefs[0] ?? null, unreadCount: computeUnread(briefs) });
      },
      getUnreadCount: () => computeUnread(get().briefs),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() =>
        createPerUserStorage(STORAGE_KEY, () => {
          try { return useAuthStore.getState().user?.id ?? null; } catch { return null; }
        }),
      ),
      partialize: (s) => ({ briefs: s.briefs, config: s.config }),
      onRehydrateStorage: () => (s) => {
        if (!s) return;
        const briefs = s.briefs ?? [];
        s.latest = briefs[0] ?? null;
        s.unreadCount = computeUnread(briefs);
      },
    },
  ),
);
