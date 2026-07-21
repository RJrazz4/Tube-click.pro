import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useSoftGate } from "@/contexts/SoftGateContext";
import { isGuestWallRequired } from "@/lib/auth/guestAccess";

export function SoftGateRoute({ children }: { children: ReactNode }) {
  const { requestAuthentication } = useSoftGate();
  const location = useLocation();
  const navigate = useNavigate();
  const [blocked, setBlocked] = useState(true);

  useEffect(() => {
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
  }, [location.key, navigate, requestAuthentication]);

  return (
    <div className={blocked ? "pointer-events-none select-none blur-sm transition-all" : "transition-all"} aria-hidden={blocked}>
      {children}
    </div>
  );
}
