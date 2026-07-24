import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ReferralShareActions({ url }: { url: string }) {
  const share = async () => {
    const payload = { title: "Tube Click Pro Creator Intelligence", text: "Try a local creator intelligence scan with Tube Click Pro.", url };
    try {
      if (navigator.share) await navigator.share(payload);
      else { await navigator.clipboard.writeText(url); toast.success("Referral link copied"); }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Sharing was not completed");
    }
  };
  return <Button onClick={() => void share()} variant="outline" className="gap-2 border-cyan-400/25"><Share2 className="h-4 w-4" />Share link</Button>;
}

export function CopyReferralButton({ url }: { url: string }) {
  return <Button onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Referral link copied")).catch(() => toast.error("Copy failed"))} variant="outline" className="gap-2"><Copy className="h-4 w-4" />Copy link</Button>;
}
