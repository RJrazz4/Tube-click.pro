# CTO MASTER PLAN — Fix the persistent 401/403 on `/api/clone-crush`

**Status:** DRAFT — for CTO review. **No code has been changed for this plan.**
**Owner:** Lead Dev / CTO
**Scope:** End-to-end auth correctness for the Chain-Loop rewrite (Step 5), from
frontend input → client token → server GoTrue validation → result tabs.

---

## 1. Architectural Review — the exact data flow

### 1.1 Frontend: user input → request
1. `src/pages/CloneCrush.tsx` — user runs **Create Content Package**.
2. `submitRewrite()` → `cloneCrushMutation.mutateAsync({ action: "rewrite", ... })`.
3. `useCloneCrushMutation()` = `src/hooks/useSecureQuery.ts` → `fetchEdgeFunctionJson("clone-crush", body, ...)`.
4. `src/api/client/secureClient.ts`:
   - `getApiEndpoint("clone-crush")` → **hard-pinned Vercel** `"/api/clone-crush"` (`VERCEL_ROUTE_MAP`), `isVercel: true`.
   - `buildHeaders()` → `Authorization: Bearer ${await getValidAccessToken()}`.

### 1.2 Client token minting
- `src/lib/auth/accessToken.ts` → `getValidAccessToken()`:
  - Reads `supabase.auth.getSession()`; auto-refreshes any token within 2 min of expiry.
  - `{ forceRefresh: true }` calls `supabase.auth.refreshSession()` (used on 401 recovery).
- `src/integrations/supabase/client.ts` → `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, …)`:
  - PKCE flow, `autoRefreshToken: true`, `persistSession: true`, custom per-user namespaced storage.

### 1.3 Server: token validation (the failing step)
- `api/clone-crush.ts` (Vercel Edge, `runtime: 'edge'`), `action === 'rewrite'`:
  - Free tier → `consumeDailyQuota(req)` → `authenticatedUser(req)`.
  - `authenticatedUser` → `verifyCallerToken(authorization)`
    → `GET ${projectUrl}/auth/v1/user` with `apikey` + `Authorization: Bearer <token>`.
  - **200 + `user.id`** ⇒ caller valid. **Otherwise** ⇒ `AUTH_REQUIRED` 401.
- Pro tier → `resolveTier` → same `authenticatedUser`, then service-role RPC.

### 1.4 After auth succeeds (only then)
- `fetchOpenRouterWithRetry` → rewrite JSON → server returns `{ success, rewrite }`.
- Client: `addRewrite(...)` + `saveWorkflowPackage(...)` + `saveContent(...)` → `setActiveRewrite(...)`.
- UI: `Tabs` render **Script / Thumbnail / SEO tags / Editing guide** from `activeRewrite`
  (`src/pages/CloneCrush.tsx` ~line 1716–1765). This render path is confirmed wired
  and correct; it is gated behind a *successful* rewrite.

### 1.5 Data-flow conclusion
The only gate standing between the user and the tabs is **server-side GoTrue validation**.
The render layer (Phase 3) is intact — the failure is entirely upstream at auth.

---

## 2. What is verified CORRECT today

| Layer | Verdict | Evidence |
|---|---|---|
| Client & server same project | ✅ | Deployed bundle URL + `/auth/v1/settings` key test + server `envProject` = `tiglslhkmamrjtpkskkd` |
| Client attaches bearer | ✅ | `buildHeaders()` → `Authorization: Bearer <token>`; confirmed in code |
| Bearer extraction on server | ✅ | `authenticatedUser` reads `authorization`, requires `bearer ` prefix |
| Auth uses standard `getUser()`-equivalent | ✅ | After `f1ac51e`: `GET /auth/v1/user` with caller Bearer + anon/publishable `apikey`. No crypto, no admin fallback |
| RLS not the cause | ✅ | Failure fires *before* any query; later DB writes use service-role SECURITY DEFINER RPCs (bypass RLS) |
| Result tabs render | ✅ | `activeRewrite` → Tabs render; code is present and wired |

---

## 3. Root-cause analysis — what is actually broken

**Candidate (most probable) — API-key *generation* mismatch between client and server.**

The client authenticates with the **new publishable key** (`sb_publishable_…`).
The server resolves its `apikey` in this order:

```
SUPABASE_ANON_KEY || VITE_SUPABASE_ANON_KEY || VITE_SUPABASE_PUBLISHABLE_KEY
  || SUPABASE_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY
```

It picks **only one**. If `SUPABASE_ANON_KEY` is set in Vercel to a **legacy
`eyJ…` JWT-format anon key** (a different key generation from the `sb_publishable_`
key the client used to mint the token), GoTrue can validate the token against a
different signing context and return `bad_jwt` / *"signature is invalid"* for a
token that is a perfectly fresh, valid session under the client's key generation.

This exactly matches the evidence: fresh Google token, same project, standard
`getUser()`-equivalent endpoint, `errorCode: "bad_jwt"`.

**Candidate 2 — JWT signing secret drift (project-level).** If the Supabase
project's JWT secret was rotated/regenerated, old-generation tokens fail even
against their own key. Requires a Supabase dashboard action, not code.

**Candidate 3 — Vercel env points at the stray/dummy project.** Ruled out for the
*matching* URL (`envProject` matches the client). Re-verify the *key* env vars only.

### De-cision point (honesty)
We have **never captured a real, freshly-minted token going through the server's
GoTrue check** — every prior test used a deliberately-forged token (which *should*
be rejected). So the above is a strong, well-supported hypothesis, not yet proof.
Phase 0 gets us the single decisive artifact in one real user run.

---

## 4. THE FIX APPROACH — native, no hacks

- **Never** hand-verify JWT signatures, **never** use a crypto fallback, **never**
  use the service-role key as the caller credential.
- **Align the `apikey` the server sends with the key generation the client actually
  uses** (the publishable key), and iterate only over *user-facing* anon/publishable
  keys so a stale legacy anon key can't mask the correct one. This is standard
  `supabase.auth.getUser()` semantics — the correct credential, not a bypass.
- Keep the `callerAuth` diagnostic so every rejection self-reports the real GoTrue
  verdict (status + `error_code`/`msg` + which URL/key), for zero-log forensics.

---

## 5. Execution Plan — Phases (NO code runs until approved)

### Phase 0 — Instrument & capture ground truth (read-only, non-destructive)
- Add telemetry that records **which env keys are present (booleans only, never
  values)**, the URL list resolved, and the exact GoTrue response per attempt.
- Deploy. **CTO/user runs the flow once with a real Google session.** Capture the
  live `callerAuth` for a *real* token.
- **Gate:** this single artifact decides between Candidate 1 (code fix) and
  Candidate 2 (Supabase-dashboard JWT-secret fix). No further code until we know.

### Phase 1 — Env-var verification & alignment
- Confirm in Vercel: `SUPABASE_URL`, `VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` all → the one real
  project `tiglslhkmamrjtpkskkd`, using ONE consistent key generation.
- (I cannot read Vercel secrets; this step needs the CTO to open Vercel →
  Settings → Environment Variables and confirm/correct values, or paste names.)
- **Gate:** all keys point at one project; no legacy/stray key present.

### Phase 2 — Backend auth fix (native)
- `verifyCallerToken`: validate with the **publishable key matching the client**
  first, then legacy anon; iterate over user-facing keys only; keep standard
  `GET /auth/v1/user`. Remove single-key precedence so a stale anon key can't
  mask the correct publishable key.
- Keep `callerAuth` diagnostic (status + code/msg + URL/key per attempt).
- **Gate:** typecheck, eslint, 606 tests, build all green before deploy.

### Phase 3 — UI rendering check
- Verify a **successful** rewrite renders Script/Thumbnail/Tags/Editing tabs.
- Confirm "No Active Chain-Loop Package" appears **only** on genuine non-auth
  failure; ensure free-tier cooldown/lock never hides a completed result.
- **Gate:** tabs render; no silent reset after success.

### Phase 4 — Verify & deploy
- Full gate suite (3-project typecheck + eslint + 606 tests + `vite build`).
- Push to `main`; staged deploy; validate end-to-end with a real signed-in run.

---

## 6. Decisions I need from the CTO before execution

1. **Approach approval:** Is the "align apikey generation + real-token capture"
   plan acceptable, vs. any preference to sidestep Phase 0?
2. **Vercel env access:** Can you confirm (or paste, redacted names of) the
   current values of `SUPABASE_ANON_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY`, and
   whether `SUPABASE_ANON_KEY` is a legacy `eyJ…` key? This is the fastest way to
   confirm Candidate 1 without a user run.
3. **Supabase dashboard:** Is `JWT Secret` (Settings → Auth) a default/rotated
   value, and has it ever been regenerated? Determines Candidate 2.

---

## 7. Risks / mitigations

| Risk | Mitigation |
|---|---|
| Wrong key generation hypothesis | Phase 0 real-token capture resolves it before any code change |
| JWT secret needs dashboard action | Phase 0/Phase 1 detect; held at human (CTO) step, no code bypass |
| Regression in auth | Standard `getUser()` path kept; full gate suite; staged deploy |
| Rendering defect masked by auth | Phase 3 isolated after auth green; verified path already exists |
