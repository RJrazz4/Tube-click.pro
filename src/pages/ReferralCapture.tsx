import { useEffect, useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { captureReferralClick } from "@/lib/referrals/client";

export default function ReferralCapture() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Activating your creator referral perk…");

  useEffect(() => {
    let active = true;
    const capture = async () => {
      try {
        await captureReferralClick(code);
        if (active) setMessage("Referral perk activated. Taking you to TubeClick Pro…");
      } catch {
        if (active) setMessage("This referral link is invalid or expired. Taking you to TubeClick Pro…");
      } finally {
        window.setTimeout(() => {
          if (active) navigate("/", { replace: true });
        }, 900);
      }
    };
    void capture();
    return () => { active = false; };
  }, [code, navigate]);

  return (
    <div className="flex min-h-[65vh] items-center justify-center">
      <Card className="w-full max-w-lg border-primary/25 bg-card/90 text-center shadow-lg backdrop-blur-xl">
        <CardContent className="flex flex-col items-center gap-4 p-8">
          <div className="relative rounded-2xl bg-primary/10 p-4">
            <Gift className="h-8 w-8 text-primary" />
            <Loader2 className="absolute -right-2 -top-2 h-5 w-5 animate-spin text-cyan-400" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">Viral Growth Pass</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
