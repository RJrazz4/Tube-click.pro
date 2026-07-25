# Referral Loop and Monetization

TubeClick Pro's acquisition engine is a **qualified chain-referral program** designed for compounding growth without rewarding click fraud. Pro access is granted to referrers only after a strict qualification predicate is met; free-tier gating is backed by server-side enforcement in Supabase and Vercel.

---

## 1. Referral Program Mechanics

**Qualification rule.** A referrer earns a seven-day Pro pass when **both** conditions hold:

1. They have sent three invites whose recipients *joined* the product (verified sign-ups).
2. At least **one** of those invitees has themselves unlocked Pro (either via payment or via their own qualified referral chain).

This "chain" predicate is evaluated atomically in Postgres via an RPC, so concurrent invite events cannot double-grant. The rule deliberately makes empty invites (no conversion) and self-invites worthless.

**Pro grant.** On qualification, the RPC writes a 7-day Pro entitlement row for the referrer and propagates "up" the chain — an invitee qualifying also re-evaluates their own referrer. A daily cleanup job expires grants older than seven days (unless converted to paid).

**Seed grants.** To bootstrap new networks without deadlock, an administrator may grant a seed Pro window from a service-role context:

```sql
select public.admin_grant_seed_pro('<user-uuid>', 7);
```

Signup alone never grants Pro.

## 2. Attribution and Anti-Fraud

- **Signed share links.** Each share link is an HMAC-SHA256 token under `REFERRAL_SIGNING_SECRET`. Tampered links are rejected.
- **HttpOnly cookie.** First click through a referral link sets a signed, Secure, SameSite=Lax cookie with a 30-day lifetime. Attribution survives navigation but cannot be read from client JavaScript.
- **Server-side verification.** The `/api/referrals` endpoint validates the signature, writes an attribution event to Postgres, and returns a sanitized share summary.
- **Duplicate-reward detection.** The server records a keyed HMAC of the requesting IP address (the raw IP is never persisted) so duplicate rewards from the same network/device are blocked.
- **No fingerprinting.** Raw IP addresses, browser fingerprints, or canvas probes are not stored or logged.
- **RLS.** Direct client writes to referral tables are denied by Row-Level Security; all writes go through the RPC or the Vercel endpoint using the service role.

## 3. Deployment Checklist

1. Apply all migrations through `supabase/migrations/202607210004_referral_dashboard_authenticated_access.sql` against the production Supabase project.
2. Configure these **server-only** variables in Vercel (never with a `VITE_` prefix):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `REFERRAL_SIGNING_SECRET` — generate with `openssl rand -hex 32`.
3. Deploy `/api/referrals` — it ships automatically with the rest of `api/` on the same origin.
4. Enable the optional daily cleanup job (commented `pg_cron` example in migration `202607210003_qualified_referral_chain.sql`) with a 90-day retention window for raw events.
5. Verify the qualification RPC returns grants for a seed user before enabling public sharing.

## 4. Native Sponsor Inventory

Sponsor placements are **off by default**. They render only when configured, and they are always visibly disclosed as featured partnerships.

To enable:

1. Set the public `VITE_SPONSOR_*` variables documented in `.env.example`.
2. `VITE_SPONSOR_PLACEMENTS` accepts a comma-separated list of placement IDs (`seo`, `voice`).
3. The destination URL must use HTTPS and its host must appear in `VITE_SPONSOR_ALLOWED_HOSTS`; any mismatch causes the component to render nothing (fail-closed).
4. Sponsor links use `rel="sponsored noopener noreferrer"` and a visible "Featured partner" disclosure.

Do not enable sponsor placements until the commercial partnership, copy, and destination domain have been reviewed and approved.

## 5. Paid Tier Integration

The paid-Pro path is mediated by a locker webhook (`LOCKER_URL`). The server verifies entitlements against the locker and writes entitlements into Supabase; the client never holds proof of payment. Client-tier indicators are optimistic UI only — `/api/v1/tiers` returns the authoritative catalog, and per-request middleware enforces caps (scenes per storyboard, thumbnails per request, premium model access).

See also:

- `packages/orchestrator/api/tiers-handler.ts` — tier caps and policy
- `api/referrals.ts` — attribution and grant RPCs
- `supabase/migrations/` — schema, RPCs, RLS policies
