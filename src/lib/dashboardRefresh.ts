import { create } from "zustand";

/**
 * Dashboard refresh trigger.
 *
 * Directive 6 — "Sidebar & navigation harmony": clicking the sidebar Dashboard
 * (→ "/") must force a clean state refresh of the Command Center so the master
 * hub shows real-time synced metrics instantly.
 *
 * React Router's <Link to="/"> is a no-op when already on "/", so it can't
 * remount the hub by itself. This store lets the Sidebar bump a counter on
 * every Dashboard click; the Dashboard page uses that as a React `key` on the
 * Command Center, remounting the hub fresh (refetch on mount).
 */
interface DashboardRefreshState {
  nonce: number;
  bump: () => void;
}

export const useDashboardRefresh = create<DashboardRefreshState>((set) => ({
  nonce: 0,
  bump: () => set((s) => ({ nonce: s.nonce + 1 })),
}));
