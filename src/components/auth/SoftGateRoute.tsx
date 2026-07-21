import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useSoftGate } from "@/contexts/SoftGateContext";
import { isGuestWallRequired } from "@/lib/auth/guestAccess";

export function SoftGateRoute({ children }: { children: ReactNode }) {
  const { isAuthLoading, requestAuthentication } = useSoftGate();
  const location = useLocation();
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState(true);

  useEffect(() => {
    // Do not start the guest-wall decision until Supabase has finished reading
    // its persisted session. Without this gate, a refresh can redirect a valid
    // user before getSession restores their token from localStorage.
    if (isAuthLoading) {
      setBlocked(true);
      return;
    }

    let active = true;
    setBlocked(true);
    const check = async () => {
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
    };
    void check();
    return () => { active = false; };
  }, [isAuthLoading, location.key, navigate, requestAuthentication]);

  return (
    <div className={blocked ? "pointer-events-none select-none blur-sm transition-all" : "transition-all"} aria-hidden={blocked}>
      {children}
    </div>
  );
}
