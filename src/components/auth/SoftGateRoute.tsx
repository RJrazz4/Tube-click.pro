import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useSoftGate } from "@/contexts/SoftGateContext";
import { isGuestWallRequired } from "@/lib/auth/guestAccess";

export function SoftGateRoute({ children }: { children: ReactNode }) {
  const { isAuthLoading, requestAuthentication } = useSoftGate();
  const location = useLocation();
  const navigate = useNavigate();
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
        const authenticated = await requestAuthentication("access this tool");
        if (!active) return;
        if (authenticated) setBlocked(false);
        else navigate("/", { replace: true });
      } catch {
        // On any error, unblock to avoid frozen blur overlay
        if (active) setBlocked(false);
      }
    };
    void check();
    return () => { active = false; };
  }, [isAuthLoading, location.key, navigate, requestAuthentication]);

  // FIX: Removed global blur (blur-sm) and pointer-events-none that was freezing
  // the entire UI when auth was loading or guest wall check hung.
  // Content is now always visible and clickable.
  return (
    <div className="transition-all" aria-hidden={blocked}>
      {children}
    </div>
  );
}
