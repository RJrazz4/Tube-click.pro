import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { useSoftGate } from "@/contexts/SoftGateContext";
import { isGuestWallRequired } from "@/lib/auth/guestAccess";

export function SoftGateRoute({ children }: { children: ReactNode }) {
  const { isAuthLoading, requestAuthentication } = useSoftGate();
  const location = useLocation();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    // Do not start the guest-wall decision until Supabase has finished reading
    // its persisted session. Without this gate, a refresh can redirect a valid
    // user before getSession restores their token from localStorage.
    // While loading, do NOT blur or block the UI – keep it fully visible and clickable.
    if (isAuthLoading) {
      return;
    }

    let active = true;
    const check = async () => {
      try {
        const wallRequired = await isGuestWallRequired();
        if (!active) return;
        if (!wallRequired) {
          setBlocked(false);
          return;
        }
        await requestAuthentication("access this tool");
        if (!active) return;
        // The dialog always resolves in place (Close / X / sign-in) — never
        // navigate the user away from the tool they opened.
        setBlocked(false);
      } catch {
        // On any error, unblock to avoid frozen blur overlay
        if (active) setBlocked(false);
      }
    };
    void check();
    return () => { active = false; };
  }, [isAuthLoading, location.key, requestAuthentication]);

  // FIX: Removed global blur (blur-sm) and pointer-events-none that was freezing
  // the entire UI when auth was loading or guest wall check hung.
  // Content is now always visible and clickable.
  return (
    <div className="transition-all" aria-hidden={blocked}>
      {children}
    </div>
  );
}
