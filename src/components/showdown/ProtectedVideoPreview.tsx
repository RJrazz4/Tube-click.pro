import { Lock, Eye, Flame, ShieldCheck } from "lucide-react";
import type { CompetitorVideo } from "@/stores/useCloneCrushStore";

function compact(value: string | number | undefined) {
  if (typeof value === "number") return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return value || "—";
}

export function ProtectedVideoPreview({ video }: { video: CompetitorVideo }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-cyan-400/30 bg-slate-950">
      <img src={video.thumbnail} alt="Protected competitor intelligence preview" className="h-full w-full object-cover opacity-30 blur-[3px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,.18),transparent_55%),linear-gradient(135deg,rgba(2,6,23,.72),rgba(8,15,35,.96))]" />
      <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        <div className="mb-1 flex items-center gap-1 rounded-full border border-cyan-300/40 bg-cyan-300/10 px-2 py-1 text-[8px] font-bold uppercase tracking-[.18em] text-cyan-200">
          <ShieldCheck className="h-3 w-3" /> Encrypted intel
        </div>
        <Lock className="mb-1 h-5 w-5 animate-pulse text-cyan-300" />
        <span className="text-[10px] font-black uppercase tracking-wider text-white">Viral Blueprint Locked</span>
        <span className="mt-1 text-[8px] text-cyan-100/70">Hook architecture protected</span>
      </div>
      <div className="absolute bottom-1.5 left-1.5 right-1.5 grid grid-cols-2 gap-1 text-[8px] font-semibold">
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-1 text-white"><Eye className="h-2.5 w-2.5 text-cyan-300" />{compact(video.views)}</span>
        <span className="flex items-center gap-1 rounded bg-black/70 px-1.5 py-1 text-orange-300"><Flame className="h-2.5 w-2.5" />{video.viralVelocityScore ?? "—"} velocity</span>
      </div>
    </div>
  );
}
