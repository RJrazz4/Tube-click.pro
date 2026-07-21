# Phase 5 — Growth and Monetization Deployment

## Referral loop

1. Apply all migrations through `supabase/migrations/202607210003_qualified_referral_chain.sql` to the production Supabase project.
2. Configure these **server-only** Vercel variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `REFERRAL_HASH_SECRET` (at least 32 cryptographically random bytes)
3. Deploy `/api/referrals` on the same origin as the application.
4. Configure a daily 90-day event-retention cleanup job using the commented `pg_cron` example in the migration.

The service-role key and HMAC secret must never use a `VITE_` prefix. Direct client writes to both referral tables are denied. Pro requires three verified invited friends plus at least one of those friends having unlocked Pro. The chain evaluator automatically propagates a new unlock to the qualifying referrer.

To start a new network without deadlock, an administrator may run `select public.admin_grant_seed_pro('<user uuid>', 7);` from a trusted service-role context. Signup alone never grants Pro.

Attribution uses a signed, HttpOnly, Secure, SameSite=Lax cookie with a 30-day lifetime. Raw IP addresses and browser fingerprints are neither stored nor logged. The API persists only a keyed HMAC of the request IP for duplicate-reward detection.

## Native sponsor inventory

Sponsor banners are disabled by default. Configure all public `VITE_SPONSOR_*` variables documented in `.env.example`, then rebuild the frontend. `VITE_SPONSOR_PLACEMENTS` accepts `seo`, `voice`, or both.

The CTA destination must use HTTPS and match `VITE_SPONSOR_ALLOWED_HOSTS`; otherwise the component renders nothing. Links include `rel="sponsored noopener noreferrer"`, and every placement is visibly disclosed as a featured partnership.

Do not configure sponsor copy until the commercial partnership and destination domain have been reviewed and approved.
