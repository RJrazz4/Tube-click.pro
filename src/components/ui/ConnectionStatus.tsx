import { useEffect, useState } from "react";
import { CloudOff, Wifi } from "lucide-react";

export function ConnectionStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    return () => { window.removeEventListener("online", onlineHandler); window.removeEventListener("offline", offlineHandler); };
  }, []);
  if (online) return null;
  return <div role="status" className="fixed bottom-3 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-amber-400/30 bg-background/95 px-3 py-2 text-[11px] font-mono text-amber-200 shadow-lg backdrop-blur-xl"><span className="flex items-center gap-2"><CloudOff className="h-3.5 w-3.5" />Offline • saved local work remains available</span></div>;
}

export function OnlineStatusLabel() {
  return <span className="flex items-center gap-1 text-[9px] font-mono text-green-400"><Wifi className="h-3 w-3" />Online</span>;
}
