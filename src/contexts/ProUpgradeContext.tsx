import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ProUpgradeTab = "payment" | "referral";

interface OpenOptions {
  /** Which tab to open first. Defaults to "payment". */
  defaultTab?: ProUpgradeTab;
  /** Optional contextual reason (maps to legacy upsell reasons). */
  reason?: string;
}

interface ProUpgradeContextValue {
  isOpen: boolean;
  defaultTab: ProUpgradeTab;
  reason?: string;
  openProUpgrade: (options?: OpenOptions) => void;
  closeProUpgrade: () => void;
}

const ProUpgradeContext = createContext<ProUpgradeContextValue | null>(null);

export function ProUpgradeProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState<ProUpgradeTab>("payment");
  const [reason, setReason] = useState<string | undefined>(undefined);

  const openProUpgrade = useCallback((options?: OpenOptions) => {
    setDefaultTab(options?.defaultTab ?? "payment");
    setReason(options?.reason);
    setIsOpen(true);
  }, []);

  const closeProUpgrade = useCallback(() => setIsOpen(false), []);

  const value = useMemo<ProUpgradeContextValue>(
    () => ({ isOpen, defaultTab, reason, openProUpgrade, closeProUpgrade }),
    [isOpen, defaultTab, reason, openProUpgrade, closeProUpgrade],
  );

  return <ProUpgradeContext.Provider value={value}>{children}</ProUpgradeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProUpgrade(): ProUpgradeContextValue {
  const ctx = useContext(ProUpgradeContext);
  if (!ctx) throw new Error("useProUpgrade must be used inside ProUpgradeProvider");
  return ctx;
}
