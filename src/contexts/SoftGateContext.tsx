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
import { getCanonicalRoot } from "@/lib/domain/canonical";
import { consumeGuestPreview, loadProEntitlement, RegistrationRequiredError } from "@/lib/auth/guestAccess";
import { loadTrialEntitlement } from "@/lib/auth/trialAccess";
import { rememberAuthReturnTo, safeAuthReturnTo } from "@/lib/auth/pendingAuth";
import { shouldForceResolvePendingAuth } from "@/contexts/softGateAuthDecision";
import { getValidAccessToken } from "@/lib/auth/accessToken";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";
import { useCloneCrushStore } from "@/stores/useCloneCrushStore";
import { useContentStore } from "@/stores/useContentStore";
import { useWorkflowStore } from "@/stores/useWorkflowStore";
import { getPinnedUserId, purgeAllUserStores, pinUserId } from "@/lib/storage/perUserStorage";

interface SoftGateContextValue {
  /** True until Supabase has restored (or definitively rejected) local session storage. */
  isAuthLoading: boolean;
  /** True while the current session is being reconciled with server entitlement. */
  isEntitlementLoading: boolean;
  /** False when entitlement reconciliation failed; gated tools must fail safe to Free. */
  isEntitlementVerified: boolean;
  isAuthenticated: boolean;
  /**
   * The single authoritative "auth is fully hydrated and usable" flag: a real
   * session exists AND entitlement reconciliation has completed AND the
   * reconciliation is no longer in flight. This is the only signal gated
   * actions and the soft-gate UI (dialog + auth toasts) should wait on.
   */
  authReady: boolean;
  runGuarded: <T>(actionLabel: string, action: () => Promise<T> | T) => Promise<T | undefined>;
  requestAuthentication: (actionLabel?: string) => Promise<boolean>;
}

const SoftGateContext = createContext<SoftGateContextValue | null>(null);

type PendingAuth = { actionLabel: string; resolve: (authenticated: boolean) => void };

export function SoftGateProvider({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((state) => state.setUser);
  const setLicense = useAuthStore((state) => state.setLicense);
  const setAppTier = useAppStore((state) => state.setTier);
  const [pending, setPending] = useState<PendingAuth | null>(null);
  // Never treat the initial false value as a signed-out decision. Supabase
  // restores persisted tokens asynchronously from localStorage.
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isEntitlementLoading, setIsEntitlementLoading] = useState(true);
  const [isEntitlementVerified, setIsEntitlementVerified] = useState(false);
  // Hydrate the presentation layer from the durable app snapshot immediately.
  // Supabase remains the source of truth, but this prevents a returning user
  // from seeing a signed-out header while its local refresh token is restored.
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(useAuthStore.getState().user));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const pendingRef = useRef<PendingAuth | null>(null);
  const pendingPromiseRef = useRef<Promise<boolean> | null>(null);
  // Keep the exact WindowProxy returned by window.open so callback messages can
  // be bound to the popup that this provider created, rather than trusting an
  // arbitrary window that knows the message shape.
  const authPopupRef = useRef<Window | null>(null);
  // The storage pin is written before React mounts. Initializing from it avoids
  // treating an ordinary same-user reload as an account switch and purging the
  // very persisted drafts/results we are about to restore.
  const lastUserIdRef = useRef<string | null>(getPinnedUserId());
  const sessionSyncGenerationRef = useRef(0);

  /**
   * Auth is "fully ready" only when we have a confirmed session, entitlement has
   * been reconciled (Free or Pro), and that reconciliation is no longer in
   * flight. This is the single gate for resuming gated actions: an action must
   * never resume while isEntitlementLoading is still true, otherwise it runs
   * before the session is usable and silently bails ("nothing happens").
   */
  const authReady = isAuthenticated && isEntitlementVerified && !isEntitlementLoading;
  // Latest-value mirror so runGuarded's async continuation (which may fire
  // before React has re-rendered after setState) can read the current readiness
  // instead of a stale closure.
  const authReadyRef = useRef(authReady);
  authReadyRef.current = authReady;

  /**
   * Wipe zustand-persisted client state whenever the authenticated user
   * changes (new login, different account, sign-out). This is the CLIENT
   * half of cross-user isolation: server-side RLS + SECURITY DEFINER
   * RPCs already enforce that DB reads are scoped to auth.uid(), but the
   * previous user's cached profile/scripts/workflow MUST NOT hydrate into
   * the new session's UI.
   */
  const resetClientStateForUser = useCallback((userId: string | null) => {
    // First reset the in-memory stores so any React components reading
    // from them unmount stale data immediately (before the persist
    // rehydration runs against the new namespace).
    useCloneCrushStore.getState().clearAll();
    useContentStore.getState().clearAll();
    useWorkflowStore.getState().clearWorkflow();
    // Then wipe the localStorage buckets for both the previous user and
    // the guest bucket so they cannot re-hydrate.
    purgeAllUserStores(lastUserIdRef.current);
    if (userId) purgeAllUserStores(null); // also clear guest bucket on sign-in
    // Repin the active user id so every per-user storage adapter (incl.
    // the Supabase auth-storage adapter and the auth-store snapshot)
    // resolves to the new namespace BEFORE any rehydration fires.
    pinUserId(userId);
    lastUserIdRef.current = userId;
  }, []);

  const finishPending = useCallback((authenticated: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    pendingPromiseRef.current = null;
    setPending(null);
    current?.resolve(authenticated);
  }, []);

  const syncSession = useCallback(async (session: Session | null) => {
    const generation = ++sessionSyncGenerationRef.current;
    const incomingUserId = session?.user?.id ?? null;
    setIsEntitlementLoading(true);
    setIsEntitlementVerified(false);

    // If the authenticated user identity has changed since the last sync
    // (new login, account switch, or sign-out), wipe client-side state
    // BEFORE hydrating the new user's blobs so there is zero flash of the
    // prior user's channel / scripts / workflow. A normal same-user reload
    // is identified by the durable pin and must retain its persisted state.
    if (incomingUserId !== lastUserIdRef.current) {
      resetClientStateForUser(incomingUserId);
    }

    if (!session?.user) {
      setIsAuthenticated(false);
      setUser(null);
      setLicense({ tier: "free", status: "active", expiresAt: undefined });
      setAppTier("free");
      if (generation === sessionSyncGenerationRef.current) {
        setIsEntitlementVerified(true);
        setIsEntitlementLoading(false);
      }
      return;
    }

    setIsAuthenticated(true);
    const user = session.user;
    const metadata = user.user_metadata ?? {};
    const displayName = [metadata.full_name, metadata.name, metadata.user_name]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    const avatar = [metadata.avatar_url, metadata.picture]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    setUser({
      id: user.id,
      email: user.email,
      name: displayName || user.email?.split("@")[0],
      avatar,
      createdAt: user.created_at,
      lastActive: new Date().toISOString(),
    });
    // Authentication confirmed. We do NOT resolve the sign-in dialog here or in
    // the finally below. Resolution happens in the authReady effect, which fires
    // strictly after React re-renders the settled (isEntitlementLoading=false)
    // state. That ordering is what lets the gated action (find opportunities /
    // chain-loop) resume only when its session is fully hydrated (isTierReady),
    // instead of running early and bailing ("nothing happens" after login).
    // Out-of-band logins reach this tab via the cross-tab observer below, so
    // this sync always runs and authReady always trips.

    try {
      const entitlement = await loadProEntitlement();
      // Phase 4: a bot-granted trial also confers Pro access.
      const trial = await loadTrialEntitlement();
      if (generation !== sessionSyncGenerationRef.current) return;

      const referralActive =
        entitlement.active && entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() > Date.now();
      const trialActive = trial.active && trial.expiresAt && new Date(trial.expiresAt).getTime() > Date.now();

      if (referralActive || trialActive) {
        // Use the later expiry when both are active.
        const candidates = [entitlement.expiresAt, trial.expiresAt].filter(
          (v): v is string => typeof v === "string",
        );
        const expiresAt = candidates.sort().at(-1) ?? null;
        setLicense({ tier: "pro", status: "active", expiresAt: expiresAt ?? undefined });
        setAppTier("pro");
      } else {
        // Unconditionally downgrade when the server says not pro. This
        // prevents a stale localStorage { tier: "pro" } from reaching a
        // premium request during a later Free session.
        setLicense({ tier: "free", status: "active", expiresAt: undefined });
        setAppTier("free");
      }
      setIsEntitlementVerified(true);
    } catch {
      // Keep the durable snapshot for offline presentation, but gated tools
      // fail safe to Free while isEntitlementVerified is false.
    } finally {
      // Only settle the loading flag here; the sign-in dialog + auth toasts are
      // NOT resolved in this finally. Resolving in the same synchronous block as
      // setState lets a waiting runGuarded continuation fire before React
      // re-renders (React batching), so the gated action could run before
      // isEntitlementLoading is actually false and silently bail. Dismissal and
      // resumption are handled by the authReady effect below, which fires
      // strictly after the re-render.
      if (generation === sessionSyncGenerationRef.current) {
        setIsEntitlementLoading(false);
      }
    }
  }, [resetClientStateForUser, setAppTier, setLicense, setUser]);

  // Single auth lifecycle gate. The moment auth is FULLY hydrated (a real
  // session + entitlement reconciled + not still loading), settle every piece
  // of the soft-gate UI and resume traffic in one place, strictly after React
  // has re-rendered the finished state:
  //   1. finishPending(true)  -> close the sign-in dialog AND resolve any
  //      runGuarded waiter (which then re-checks authReady before running).
  //   2. clear the queued auth toasts so a stale "Sign in..." notification can
  //      never stay stuck after a successful login.
  // This is the same predicate that previously lived in the syncSession
  // finally; pulling it into an effect (fired after commit) is what removes the
  // "dialog closes but the action doesn't fire" race.
  useEffect(() => {
    if (
      shouldForceResolvePendingAuth({
        isAuthenticated,
        isEntitlementVerified,
        isEntitlementLoading,
        hasPendingAuthRequest: Boolean(pendingRef.current),
      })
    ) {
      finishPending(true);
      toast.dismiss("clone-crush-auth");
      toast.dismiss("clone-crush-forbidden");
    }
  }, [isAuthenticated, isEntitlementVerified, isEntitlementLoading, finishPending]);

  // Independently clear any lingering auth toast the moment a session is usable
  // (even if there is no pending request to resolve - e.g. a toast left over
  // from an earlier attempt on a returning user's session).
  useEffect(() => {
    if (isAuthenticated && !isEntitlementLoading) {
      toast.dismiss("clone-crush-auth");
      toast.dismiss("clone-crush-forbidden");
    }
  }, [isAuthenticated, isEntitlementLoading]);

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

  // Cross-tab / out-of-band observer. While a sign-in dialog is open, the
  // session may be completed outside this tab (popup, a new tab, a full-page
  // redirect, or another tab sharing the origin). Supabase's onAuthStateChange
  // only fires within the client instance that persisted the session, so this
  // dialog tab would never learn about it. Rather than trust that fragile
  // signal chain, observe cross-tab writes to this origin's storage and also
  // re-read the durable session on a short poll while a request is pending; the
  // moment a real session appears, syncSession() runs to completion, which trips
  // the authReady gate above -> dialog closes, toasts clear, and the gated
  // action resumes hydrated. The poll stops once nothing is pending.
  useEffect(() => {
    const refreshIfPending = async () => {
      if (!pendingRef.current) return;
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        void syncSession(data.session);
      }
    };
    const onStorage = () => {
      // The Supabase auth client writes the durable pin (tc:last-auth-user-id)
      // and session tokens to same-origin localStorage; a cross-tab write
      // surfaces here as a window 'storage' event.
      void refreshIfPending();
    };
    window.addEventListener("storage", onStorage);
    const poll = window.setInterval(() => void refreshIfPending(), 1500);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(poll);
    };
  }, [syncSession]);

  useEffect(() => {
    const receiveAuth = (event: MessageEvent) => {
      const isAuthComplete = event.data === "tc-auth-complete" || event.data?.type === "tc-auth-complete";
      if (!isAuthComplete) return;

      const canonicalRoot = getCanonicalRoot();
      const callbackOrigin = new URL(canonicalRoot).origin;
      // Never accept an auth signal from Google, Supabase, or another page. If
      // this provider opened a popup, also require the message to come from that
      // exact WindowProxy. The callback sends no credentials in the message.
      if (event.origin !== callbackOrigin) return;
      if (!authPopupRef.current || event.source !== authPopupRef.current) return;
      authPopupRef.current = null;

      if (window.location.origin !== callbackOrigin) {
        // Browser storage is origin-scoped. The callback persisted the session
        // on the canonical origin, so a preview deployment must move there
        // before trying to read it.
        window.location.assign(`${canonicalRoot}${window.location.pathname}${window.location.search}`);
        return;
      }

      // The callback only posts after initialize() has persisted the session.
      // Reading it here makes the UI update deterministic even where the
      // browser's BroadcastChannel notification is delayed or unavailable.
      void supabase.auth.getSession().then(({ data, error }) => {
        if (error || !data.session) {
          console.error("[auth] OAuth completed without a readable session", error);
          setAuthError("Sign-in completed, but the session could not be restored. Please try again.");
          return;
        }
        void syncSession(data.session);
      });
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

  // Resolve once auth is fully hydrated (session + entitlement reconciled).
  // Returns immediately when already ready; otherwise polls the latest-value
  // ref for a bounded window so it can never hang the guarded action forever.
  const waitForAuthReady = useCallback(async (): Promise<boolean> => {
    if (authReadyRef.current) return true;
    const started = Date.now();
    return new Promise<boolean>((resolve) => {
      const timer = window.setInterval(() => {
        if (authReadyRef.current) {
          window.clearInterval(timer);
          resolve(true);
        } else if (Date.now() - started > 15_000) {
          window.clearInterval(timer);
          resolve(false);
        }
      }, 150);
    });
  }, []);

  const runGuarded = useCallback(async <T,>(actionLabel: string, action: () => Promise<T> | T): Promise<T | undefined> => {
    try {
      await consumeGuestPreview();
    } catch (error) {
      if (!(error instanceof RegistrationRequiredError)) throw error;
      const authenticated = await requestAuthentication(actionLabel);
      if (!authenticated) {
        // The dialog can close without a confirmed login (e.g. the user closes
        // it, or it is dismissed out of band). Only proceed if a real session
        // now exists; otherwise the user genuinely didn't authenticate.
        const token = await getValidAccessToken();
        if (!token) return undefined;
      }
      // Guarantee the action only runs once auth is FULLY hydrated, so it never
      // runs before entitlement settles (the "action does nothing" failure).
      const ready = await waitForAuthReady();
      if (!ready) return undefined;
    }
    return action();
  }, [requestAuthentication, waitForAuthReady]);

  const signInWithGoogle = async () => {
    setSubmitting(true);
    setAuthError("");
    try {
      const canonicalRoot = getCanonicalRoot();
      const isCanonical = window.location.origin === canonicalRoot;

      if (!isCanonical) {
        // PKCE verifiers are origin-bound. Start the OAuth transaction on the
        // canonical origin rather than creating an unusable verifier on a
        // preview host and sending its code to a canonical callback. Only a
        // validated internal path crosses origins; no token or verifier does.
        const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const returnTo = safeAuthReturnTo(currentPath, "/") ?? "/";
        const bootstrapUrl = new URL("/auth/callback", canonicalRoot);
        bootstrapUrl.searchParams.set("start", "google");
        bootstrapUrl.searchParams.set("returnTo", returnTo);
        window.location.assign(bootstrapUrl.toString());
        return;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${canonicalRoot}/auth/callback`,
          skipBrowserRedirect: true,
          queryParams: {
            // Request refresh-token so sessions survive browser close across
            // devices (fixes the "friend's device logs in but session
            // doesn't stick" symptom).
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Google authentication could not be started");

      const popup = window.open(data.url, "tubeclick-google-auth", "popup=yes,width=520,height=720");
      if (!popup) {
        // Popup blocked — fall back to top-level redirect so the user
        // always gets a working sign-in path. The callback consumes this
        // tab-scoped location instead of dropping the user on a blank/root
        // screen after authentication.
        rememberAuthReturnTo();
        window.location.assign(data.url);
        return;
      }
      authPopupRef.current = popup;
      popup.focus();
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
    () => ({
      isAuthLoading,
      isEntitlementLoading,
      isEntitlementVerified,
      isAuthenticated,
      authReady,
      runGuarded,
      requestAuthentication,
    }),
    [
      isAuthLoading,
      isEntitlementLoading,
      isEntitlementVerified,
      isAuthenticated,
      authReady,
      requestAuthentication,
      runGuarded,
    ],
  );

  return (
    <SoftGateContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(pending)} onOpenChange={(open) => { if (!open) finishPending(false); }}>
        <DialogContent className="overflow-hidden border-primary/30 bg-card/95 p-0 shadow-[0_0_70px_rgba(139,92,246,0.22)] sm:max-w-[460px]">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative border-b border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-cyan-400/5 p-6 pb-5">
            <div className="mb-4 inline-flex rounded-2xl border border-primary/25 bg-primary/10 p-3">
              <LockKeyhole className="h-6 w-6 text-primary" />
            </div>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-black">You’ve unlocked your free preview!</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                Sign in to {pending?.actionLabel || "continue"}, keep your work, and start the <span className="font-semibold text-foreground">2-step path to a free 21-Day Pro Pass.</span>
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] text-muted-foreground">
              {["Keep your result", "Get your invite toolkit", "Earn 21-Day Pro"].map((benefit) => (
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
