/**
 * src/stores/useInterrogateStore.ts — Ghost Interrogation session state.
 *
 * Holds the active chat drawer (open/closed, which video), the per-video
 * message history, indexing state, and streaming flag. Persisted per-user
 * under the same namespace as every other store so sessions cross refresh
 * but NEVER cross users.
 *
 * v1 is additive and does NOT touch useCloneCrushStore v6.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createPerUserStorage } from "@/lib/storage/perUserStorage";
import { useAuthStore } from "./useAuthStore";

export interface InterrogateCitation {
  chunkIndex: number;
  startTs: number | null;
  endTs: number | null;
  text: string;
  similarity: number;
}

export interface InterrogateMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  citations?: InterrogateCitation[];
  ghostReconstructed?: boolean;
  model?: string;
  error?: string;
}

export interface InterrogateSession {
  videoId: string | null;
  title?: string;
  url?: string;
  messages: InterrogateMessage[];
  indexing: boolean;
  streaming: boolean;
  indexed: boolean;
  ghostReconstructed: boolean;
  error: string | null;
}

interface InterrogateState {
  drawerOpen: boolean;
  session: InterrogateSession;

  openDrawer: (videoId: string, opts?: { title?: string; url?: string }) => void;
  closeDrawer: () => void;
  setIndexing: (v: boolean) => void;
  setIndexed: (v: boolean, ghostReconstructed?: boolean) => void;
  appendMessage: (msg: InterrogateMessage) => void;
  setStreaming: (v: boolean) => void;
  setError: (msg: string | null) => void;
  resetSession: () => void;
}

const EMPTY_SESSION: InterrogateSession = {
  videoId: null,
  messages: [],
  indexing: false,
  streaming: false,
  indexed: false,
  ghostReconstructed: false,
  error: null,
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useInterrogateStore = create<InterrogateState>()(
  persist(
    (set, get) => ({
      drawerOpen: false,
      session: { ...EMPTY_SESSION },

      openDrawer: (videoId, opts) => {
        const existing = get().session;
        const sameVideo = existing.videoId === videoId;
        set({
          drawerOpen: true,
          session: sameVideo
            ? { ...existing }
            : { ...EMPTY_SESSION, videoId, title: opts?.title, url: opts?.url, messages: [] },
        });
      },

      closeDrawer: () => set({ drawerOpen: false }),

      setIndexing: (v) =>
        set((s) => ({ session: { ...s.session, indexing: v, error: v ? null : s.session.error } })),

      setIndexed: (v, ghost) =>
        set((s) => ({
          session: {
            ...s.session,
            indexed: v,
            indexing: false,
            ghostReconstructed: ghost ?? s.session.ghostReconstructed,
            error: null,
          },
        })),

      appendMessage: (msg) =>
        set((s) => ({
          session: {
            ...s.session,
            messages: [...s.session.messages, msg],
            error: null,
          },
        })),

      setStreaming: (v) => set((s) => ({ session: { ...s.session, streaming: v } })),

      setError: (msg) => set((s) => ({ session: { ...s.session, error: msg, indexing: false, streaming: false } })),

      resetSession: () => set({ session: { ...EMPTY_SESSION } }),
    }),
    {
      name: "tubeclick:ghost-interrogate:v1",
      version: 1,
      storage: createJSONStorage(() => createPerUserStorage(
        "tubeclick:ghost-interrogate:v1",
        () => useAuthStore.getState().user?.id ?? null,
      )),
      partialize: (s) => ({
        drawerOpen: false, // never persist the open state (popup on refresh is jarring)
        session: {
          videoId: s.session.videoId,
          title: s.session.title,
          url: s.session.url,
          messages: s.session.messages,
          indexed: s.session.indexed,
          ghostReconstructed: s.session.ghostReconstructed,
        },
      }),
    },
  ),
);

export function newUserMessage(content: string): InterrogateMessage {
  return { id: uid(), role: "user", content, createdAt: Date.now() };
}
export function newAssistantMessage(content: string, extras: Partial<InterrogateMessage> = {}): InterrogateMessage {
  return { id: uid(), role: "assistant", content, createdAt: Date.now(), ...extras };
}
