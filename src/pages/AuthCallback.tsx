import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export default function AuthCallback() {
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    const finish = async () => {
      for (let attempt = 0; attempt < 30 && active; attempt++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setComplete(true);
          window.opener?.postMessage("tc-auth-complete", window.location.origin);
          window.setTimeout(() => window.close(), 500);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 200));
      }
    };
    void finish();
    return () => { active = false; };
  }, []);

  return (
    <div className="flex min-h-[65vh] items-center justify-center">
      <Card className="w-full max-w-sm border-primary/25 bg-card/95 text-center shadow-[0_0_60px_rgba(139,92,246,0.2)] backdrop-blur-xl">
        <CardContent className="flex flex-col items-center gap-3 p-8">
          {complete ? <CheckCircle2 className="h-9 w-9 text-green-400" /> : <Loader2 className="h-9 w-9 animate-spin text-primary" />}
          <h1 className="font-display text-lg font-bold">{complete ? "You’re signed in" : "Completing secure sign-in…"}</h1>
          <p className="text-xs text-muted-foreground">{complete ? "This window will close automatically." : "Keep this window open for a moment."}</p>
        </CardContent>
      </Card>
    </div>
  );
}
