# Guest Access & Registration Wall

TubeClick Pro uses a product-led growth (PLG) soft gate: an unauthenticated visitor may complete one guarded product action before being asked to sign in. This document describes the design and deployment of that gate.

## User Experience

1. A browser without an authenticated Supabase session lands on a tool page.
2. The first guarded action is permitted and is recorded server-side.
3. A second action, navigation to another creation tool, or an attempt at a Pro-only feature triggers the registration wall.
4. The pending action promise is held while the modal is open and resumes automatically after authentication (email or Google OAuth). Preserving in-memory inputs means the user never has to retype work.
5. Google OAuth runs in a popup and returns through `/auth/callback` so page state is not lost.
6. Authentication alone confers only Free-tier access; Pro is granted by qualified referral chain (see `docs/PHASE5_GROWTH_MONETIZATION.md`) or by an authorized seed grant.

## Privacy Posture

- The gate uses a signed HttpOnly cookie (`_tc_guest_preview`, HMAC-SHA256 under `GUEST_ACCESS_SECRET`) plus a local-storage fast-path marker.
- **No** browser fingerprinting, canvas probing, or persistent IP storage is used for guest gating.
- Clearing site data resets a guest preview. Stronger cross-device enforcement is a future enhancement that would be balanced against its privacy impact.

## Server Endpoint

`POST /api/guest-access` — issues or validates a guest-preview cookie. Runs on Vercel Edge.

Request/response contract is defined by the Zod schema in `api/guest-access.ts`; the handler never exposes signing material and rejects unsigned or tampered cookies.

## Deployment Checklist

1. Apply all Supabase migrations through `202607210003_qualified_referral_chain.sql`.
2. Configure the following **server-only** environment variables in Vercel (never with a `VITE_` prefix):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GUEST_ACCESS_SECRET` — at least 32 bytes of cryptographically random data; generate with `openssl rand -hex 32`.
3. Enable Google provider in Supabase Auth and add the production `https://tubeclickpro.in/auth/callback` URL (plus preview equivalents) to the allowed redirect list.
4. Enable email/password authentication. Email confirmation can be disabled for smoother immediate signup; if left enabled, the modal preserves the pending action until the session is confirmed.
5. Deploy `/api/guest-access` on the application origin (it ships automatically with the rest of `api/`).

## Test Matrix

- [ ] First action on a fresh browser succeeds without auth.
- [ ] Second action surfaces the registration wall.
- [ ] Completing email sign-in resumes the pending action with all inputs intact.
- [ ] Completing Google OAuth via popup resumes the pending action.
- [ ] Tampering with the guest cookie is rejected (401).
- [ ] Deleting site data resets to a fresh-guest state.
