import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getCanonicalRoot } from "@/lib/domain/canonical";

/**
 * Supabase owns callback parsing through detectSessionInUrl. This page waits for
 * that single initialization pass to persist the session, then tells the opener
 * to read the same durable session. It intentionally does not exchange the code
 * or set the tokens again: doing that here races Supabase's automatic callback
 * handling and PKCE authorization codes can only be exchanged once.
 */
export default function AuthCallback() {
  const [status, setStatus] = useState<"working" | "complete" | "error">("working");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    let timer: number | undefined;

    const finishNavigation = () => {
      const opener = window.opener;
      if (opener && !opener.closed) {
        // The document referrer points at the last OAuth hop (Google/Supabase),
        // not reliably at the app that opened this window. Prefer the opener's
        // origin when same-origin access is possible. For a canonical callback
        // opened by a preview deployment, use "*" only for this credential-free
        // completion signal; the opener validates both event.origin and source.
        let targetOrigin = "*";
        try {
          targetOrigin = opener.location.origin;
        } catch {
          // Cross-origin preview opener; it will navigate to canonical storage.
        }
        opener.postMessage({ type: "tc-auth-complete" }, targetOrigin);
        timer = window.setTimeout(() => window.close(), 500);
        return;
      }

      // Some mobile browsers open OAuth without retaining window.opener. In
      // that case this callback is the active tab, so return to the application
      // after the provider above has already synchronized the Zustand profile.
      timer = window.setTimeout(() => window.location.replace(getCanonicalRoot()), 500);
    };

    const finish = async () => {
      try {
        const search = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const oauthError =
          search.get("error_description") ||
          search.get("error") ||
          hash.get("error_description") ||
          hash.get("error");
        if (oauthError) throw new Error(oauthError);

        // initialize() is idempotent and returns the constructor-started
        // promise. It handles either the implicit hash or a PKCE code once.
        const { error: initializationError } = await supabase.auth.initialize();
        if (initializationError) throw initializationError;

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session?.user) {
          throw new Error("The authentication session was not created. Please start sign-in again.");
        }

        // Credentials have now been persisted by Supabase. Remove callback
        // parameters from browser history before messaging or navigating.
        window.history.replaceState({}, document.title, window.location.pathname);
        if (!active) return;
        setStatus("complete");
        finishNavigation();
      } catch (error) {
        console.error("[auth] OAuth callback failed", error);
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : "Unknown authentication error");
        setStatus("error");
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
          <p className="text-xs text-muted-foreground">
            {complete ? "Returning to TubeClick Pro…" : status === "error" ? (errorMessage || "Close this window and try again.") : "Keep this window open for a moment."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
