import { ReactNode } from "react";
import { ViralOverdriveMiniBanner } from "@/components/referrals/ViralOverdriveMiniBanner";

/**
 * Page shell for tool routes.
 *
 * v2 ("Signal over Noise"): the shared status chrome (ticker, node status,
 * live counter, broadcast indicator, intel drop, page-level video wall) now
 * lives ONCE in the app shell — TopBar carries a compact status cluster and
 * MainLayout owns the ambient background. Pages get clean content rhythm.
 *
 * The legacy props are still accepted (no-op) so existing call sites keep
 * working; they can be cleaned up opportunistically later.
 */

interface Props {
  children: ReactNode;
  intensity?: "low" | "medium" | "high";
  showTicker?: boolean;
  showIntel?: boolean;
  showNodes?: boolean;
}

export function PageWrapperGhost({ children }: Props) {
  return (
    <div className="relative min-h-[60vh]">
      <div className="relative z-10 space-y-4 sm:space-y-6">
        <ViralOverdriveMiniBanner />
        {children}
      </div>
    </div>
  );
}
