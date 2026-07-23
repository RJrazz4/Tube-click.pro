import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { consumeGuestPreview, loadProEntitlement, RegistrationRequiredError } from "@/lib/auth/guestAccess";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";

interface SoftGateContextValue {
  /** True until Supabase has restored (or definitively rejected) local session storage. */
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  runGuarded: <T>(actionLabel: string, action: () => Promise<T> | T) => Promise<T | undefined>;
  requestAuthentication: (actionLabel?: string) => Promise<boolean>;
}

const SoftGateContext = createContext<SoftGateContextValue | null>(null);

type PendingAuth = { actionLabel: string; resolve: (authenticated: boolean) => void };

export function SoftGateProvider({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);
  const setLicense = useAuthStore((state) => state.setLicense);
  const license = useAuthStore((state) => state.license);
  const setAppTier = useAppStore((state) => state.setTier);
  const [pending, setPending] = useState<PendingAuth | null>(null);
  // Never treat the initial false value as a signed-out decision. Supabase
  // restores persisted tokens asynchronously from localStorage.
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const pendingRef = useRef<PendingAuth | null>(null);
  const pendingPromiseRef = useRef<Promise<boolean> | null>(null);

  const finishPending = useCallback((authenticated: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    pendingPromiseRef.current = null;
    setPending(null);
    current?.resolve(authenticated);
  }, []);

  const syncSession = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setIsAuthenticated(false);
      setUser(null);
      if (license.tier === "pro" && license.expiresAt) {
        setLicense({ tier: "free", status: "active", expiresAt: undefined });
        setAppTier("free");
      }
      return;
    }

    setIsAuthenticated(true);
    const user = session.user;
    setUser({
      id: user.id,
      email: user.email,
      name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email?.split("@")[0],
      avatar: typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : undefined,
      createdAt: user.created_at,
      lastActive: new Date().toISOString(),
    });

    try {
      const entitlement = await loadProEntitlement();
      if (entitlement.active && entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() > Date.now()) {
        setLicense({ tier: "pro", status: "active", expiresAt: entitlement.expiresAt });
        setAppTier("pro");
      } else if (license.expiresAt && license.tier === "pro") {
        setLicense({ tier: "free", status: "active", expiresAt: undefined });
        setAppTier("free");
      }
    } catch {
      // Authentication remains valid even if entitlement sync is temporarily unavailable.
    }

    finishPending(true);
  }, [finishPending, license.expiresAt, license.tier, setAppTier, setLicense, setUser]);

  useEffect(() => {
    let active = true;

    // Subscribe before reading storage so a sign-in/sign-out that happens while
    // localStorage is being restored cannot be missed. getSession is still the
    // source of truth for the initial render.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (!active) return;
        // syncSession updates basic auth synchronously before optional
        // entitlement work; route guards may proceed as soon as the session is
        // restored rather than waiting on the referral service.
        void syncSession(session);
        setIsAuthLoading(false);
      }, 0);
    });

    const initializeSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("[auth] Failed to restore the persisted Supabase session", error);
        }
        if (active) void syncSession(data.session);
      } catch (error) {
        // A storage or network failure must not leave route guards loading
        // forever, but it also must not be mistaken for an authenticated user.
        console.error("[auth] Session initialization failed", error);
        if (active) void syncSession(null);
      } finally {
        if (active) setIsAuthLoading(false);
      }
    };

    void initializeSession();
    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, [syncSession]);

  useEffect(() => {
    const receiveAuth = (event: MessageEvent) => {
      const isAuthComplete = event.data === "tc-auth-complete" || event.data?.type === "tc-auth-complete";
      if (event.origin !== window.location.origin || !isAuthComplete) return;
      void supabase.auth.getSession().then(({ data }) => syncSession(data.session));
    };
    window.addEventListener("message", receiveAuth);
    return () => window.removeEventListener("message", receiveAuth);
  }, [syncSession]);

  const requestAuthentication = useCallback(async (actionLabel = "continue") => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    if (pendingPromiseRef.current) return pendingPromiseRef.current;
    setAuthError("");
    const authPromise = new Promise<boolean>((resolve) => {
      const next = { actionLabel, resolve };
      pendingRef.current = next;
      setPending(next);
    });
    pendingPromiseRef.current = authPromise;
    return authPromise;
  }, []);

  const runGuarded = useCallback(async <T,>(actionLabel: string, action: () => Promise<T> | T): Promise<T | undefined> => {
    try {
      await consumeGuestPreview();
    } catch (error) {
      if (!(error instanceof RegistrationRequiredError)) throw error;
      const authenticated = await requestAuthentication(actionLabel);
      if (!authenticated) return undefined;
    }
    return action();
  }, [requestAuthentication]);

  const signInWithGoogle = async () => {
    setSubmitting(true);
    setAuthError("");
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Google authentication could not be started");
      const popup = window.open(data.url, "tubeclick-google-auth", "popup=yes,width=520,height=720");
      if (!popup) throw new Error("Pop-up blocked. Allow pop-ups and try again.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setAuthError("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check your email to confirm your account, then return here to continue.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const value = useMemo<SoftGateContextValue>(
    () => ({ isAuthLoading, isAuthenticated, runGuarded, requestAuthentication }),
    [isAuthLoading, isAuthenticated, requestAuthentication, runGuarded],
  );

  return (
    <SoftGateContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) finishPending(false); }}>
        <DialogContent className="overflow-hidden border-primary/30 bg-card/95 p-0 shadow-[0_0_70px_rgba(139,92,246,0.22)] backdrop-blur-2xl sm:max-w-[460px]">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative border-b border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-cyan-400/5 p-6 pb-5">
            <div className="mb-4 inline-flex rounded-2xl border border-primary/25 bg-primary/10 p-3">
              <LockKeyhole className="h-6 w-6 text-primary" />
            </div>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-black">You’ve unlocked your free preview!</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                Sign in to {pending?.actionLabel || "continue"}, keep your work, and start the <span className="font-semibold text-foreground">2-step path to a free 7-Day Pro Pass.</span>
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] text-muted-foreground">
              {["Keep your result", "Get your invite toolkit", "Earn 7-Day Pro"].map((benefit) => (
                <div key={benefit} className="rounded-lg border border-border/50 bg-background/40 px-2 py-2">
                  <CheckCircle2 className="mx-auto mb-1 h-3.5 w-3.5 text-cyan-400" />{benefit}
                </div>
              ))}
            </div>
          </div>

          <div className="relative space-y-4 p-6 pt-5">
            <Button variant="outline" onClick={() => void signInWithGoogle()} disabled={submitting} className="h-11 w-full gap-3 border-border bg-background/50 hover:border-primary/50">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-black text-blue-600">G</span>
              Continue with Google
            </Button>

            <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or use email <span className="h-px flex-1 bg-border" />
            </div>

            <Tabs value={mode} onValueChange={(value) => setMode(value as "signup" | "login")}>
              <TabsList className="grid w-full grid-cols-2 bg-secondary/70">
                <TabsTrigger value="signup">Create account</TabsTrigger>
                <TabsTrigger value="login">Log in</TabsTrigger>
              </TabsList>
              <TabsContent value={mode} className="mt-4">
                <form onSubmit={submitEmail} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="soft-gate-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input id="soft-gate-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="h-11 bg-background/50 pl-9" placeholder="creator@example.com" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="soft-gate-password">Password</Label>
                    <Input id="soft-gate-password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 bg-background/50" placeholder="Minimum 6 characters" />
                  </div>
                  {authError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{authError}</p>}
                  <Button type="submit" disabled={submitting || !email.trim() || password.length < 6} className="cyber-button h-11 w-full gap-2">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {mode === "signup" ? "Create My Free Account" : "Log In & Continue"}
                    {!submitting && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
              No payment required. By continuing, you agree to our Terms and Privacy Policy.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </SoftGateContext.Provider>
  );
}

// Provider and hook intentionally share one module so consumers use the same context instance.
// eslint-disable-next-line react-refresh/only-export-components
export function useSoftGate() {
  const context = useContext(SoftGateContext);
  if (!context) throw new Error("useSoftGate must be used inside SoftGateProvider");
  return context;
}
