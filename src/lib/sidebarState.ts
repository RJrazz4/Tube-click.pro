import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Sidebar navigation state.
 *
 * `collapsed` drives the desktop rail: when true the sidebar shrinks to an
 * icon-only column (w-20) and the main content margin tightens to match. On
 * mobile (< 768px) the sidebar is always a bottom tab bar and ignores this
 * value — the breakpoint is handled entirely by Tailwind `md:`/`max-md:`
 * classes. Persisted so the creator's preferred layout survives reloads.
 */
interface SidebarState {
  collapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (value: boolean) => void;
}

export const useSidebarState = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: "tcpro.sidebar", partialize: (s) => ({ collapsed: s.collapsed }) },
  ),
);
