import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getCanonicalRoot } from "@/lib/domain/canonical";

/**
 * OAuth returns here in a popup. Supabase normally consumes the URL itself,
 * but doing the handoff explicitly makes this route reliable with both the
 * implicit (hash) and PKCE (code) flows, and avoids another route changing the
 * URL before the auth client has had a chance to read it.
 */
export default function AuthCallback() {
  const [status, setStatus] = useState<"working" | "complete" | "error">("working");

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const notifyParentAndClose = () => {
      // The opener can be a temporary Vercel deployment. Send the signal back to
      // its actual origin; the opener will move to canonical rather than trying
      // to read a session from the wrong origin's storage.
      const openerOrigin = document.referrer ? new URL(document.referrer).origin : getCanonicalRoot();
      window.opener?.postMessage({ type: "tc-auth-complete", canonicalOrigin: getCanonicalRoot() }, openerOrigin);
      timer = window.setTimeout(() => window.close(), 500);
    };

    const finish = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const oauthError = params.get("error_description") || params.get("error");
        if (oauthError) throw new Error(oauthError);

        // Explicitly exchange PKCE callbacks. This is harmless when the
        // provider returned an implicit-flow hash instead.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // The client usually performs this during initialization. Keep a
          // fallback for deployments where initialization raced this route.
          const hash = new URLSearchParams(window.location.hash.slice(1));
          const accessToken = hash.get("access_token");
          const refreshToken = hash.get("refresh_token");
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            if (error) throw error;
          }
        }

        for (let attempt = 0; attempt < 50 && active; attempt += 1) {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (data.session) {
            // Only remove credentials after Supabase has persisted the session.
            // replaceState preserves the callback route without leaking tokens
            // into history, referrers, or screenshots.
            window.history.replaceState({}, document.title, `${window.location.pathname}`);
            if (active) {
              setStatus("complete");
              notifyParentAndClose();
            }
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 200));
        }
        throw new Error("The authentication session was not created in time.");
      } catch (error) {
        console.error("[auth] OAuth callback failed", error);
        if (active) setStatus("error");
      }
    };

    void finish();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const complete = status === "complete";
  return (
    <div className="flex min-h-[65vh] items-center justify-center">
      <Card className="w-full max-w-sm border-primary/25 bg-card/95 text-center shadow-[0_0_60px_rgba(139,92,246,0.2)] backdrop-blur-xl">
        <CardContent className="flex flex-col items-center gap-3 p-8">
          {complete ? <CheckCircle2 className="h-9 w-9 text-green-400" /> : status === "error" ? <XCircle className="h-9 w-9 text-destructive" /> : <Loader2 className="h-9 w-9 animate-spin text-primary" />}
          <h1 className="font-display text-lg font-bold">{complete ? "You’re signed in" : status === "error" ? "Sign-in could not be completed" : "Completing secure sign-in…"}</h1>
          <p className="text-xs text-muted-foreground">{complete ? "This window will close automatically." : status === "error" ? "Close this window and try again." : "Keep this window open for a moment."}</p>
        </CardContent>
      </Card>
    </div>
  );
}
