# PLG Registration Wall

## Behavior

- A browser without an authenticated Supabase session may complete one guarded product action.
- The first action is recorded in both a signed HttpOnly cookie (`_tc_guest_preview`) and a local fast-path marker.
- A second action or navigation to another creation tool opens the registration wall.
- The original action promise remains pending while the modal is open and resumes after email or Google authentication, preserving the page's in-memory inputs.
- Google OAuth runs in a popup and returns through `/auth/callback`, preventing loss of page state.
- Authentication preserves the pending action, but Pro is granted only through the qualified referral chain or an authorized seed-user grant.

No browser fingerprinting, canvas probing, or raw IP storage is used. Clearing all browser site data can reset a guest preview; stronger cross-device enforcement would require an anonymous server identity and would materially increase privacy impact.

## Deployment

1. Apply all Supabase migrations through `202607210003_qualified_referral_chain.sql`.
2. Set these Vercel server variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GUEST_ACCESS_SECRET` (a dedicated random value of at least 32 bytes)
3. Enable Google in Supabase Auth and add the production `/auth/callback` URL to the allowed redirect URLs.
4. Configure email/password authentication. Disabling mandatory email confirmation gives the smoothest immediate signup continuity; if confirmation remains enabled, the modal keeps the pending action until the session is confirmed.
5. Deploy `/api/guest-access` on the application origin.

The service-role key and signing secret must never use a `VITE_` prefix.
