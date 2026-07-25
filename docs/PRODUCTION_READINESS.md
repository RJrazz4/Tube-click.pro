# Production Readiness

Runbook for operating TubeClick Pro in production at [tubeclickpro.in](https://tubeclickpro.in).

---

## 1. Pre-Launch Checklist

### Infrastructure
- [ ] Vercel project connected to the `main` branch of `RJrazz4/Tube-click.pro`.
- [ ] Production domain (`tubeclickpro.in`) configured with HTTPS enforced; HSTS enabled.
- [ ] All server-only environment variables set in Vercel (see [`docs/ENVIRONMENT.md`](./ENVIRONMENT.md)). Confirm no `VITE_`-prefixed variable holds a secret.
- [ ] Supabase project provisioned; migrations in `supabase/migrations/` applied via `supabase db push`.
- [ ] Supabase Auth providers configured (email + Google); OAuth callbacks point to `https://tubeclickpro.in`.
- [ ] Row-Level Security policies enabled on all user-facing tables; anonymous role has no table access.
- [ ] `REFERRAL_SIGNING_SECRET` set to a high-entropy value (≥32 bytes, generated with `openssl rand -hex 32`).
- [ ] `OPENROUTER_API_KEYS` populated with at least two production keys to absorb rate-limit rotation.
- [ ] `ELEVENLABS_API_KEY` present (Voiceover Studio) with billing limits configured on the ElevenLabs side.
- [ ] `YOUTUBE_API_KEY` present with quota headroom (Clone & Crush).
- [ ] `LOCKER_URL` returning signed entitlements for paid tiers.

### Quality
- [ ] `npm run ci` passes locally and on CI (lint + typecheck + Vitest + verifier).
- [ ] `npm run build` completes without warnings; bundle size budget:
  - Initial load < 250 KB gzipped
  - Each lazy chunk < 100 KB gzipped
- [ ] `npm run test:v1-contract` passes against a Vercel preview deployment.
- [ ] Playwright e2e suite (`npx playwright test`) passes against a preview deployment.
- [ ] Lighthouse performance ≥ 85 on mobile on the landing route.

### Observability
- [ ] Vercel Analytics enabled.
- [ ] `/api/v1/metrics` reachable and returning `status: ok`.
- [ ] Error rate alert configured in Vercel for > 3% 5xx over 5 minutes.
- [ ] Function-duration alert configured for p95 > 8s over 5 minutes.
- [ ] Supabase database CPU and storage alerts set at 70% thresholds.

### Security
- [ ] CORS `ALLOWED_ORIGINS` restricted to `https://tubeclickpro.in` (no wildcard in production).
- [ ] Supabase anon key rotated if it was ever committed to the repository or shared.
- [ ] Supabase service-role key stored only in Vercel environment variables; not in CI logs, not in `.env` on developer machines unless necessary.
- [ ] Dependabot / Renovate enabled for security updates; high-severity patches SLA 7 days.
- [ ] Rate limiter enabled for all `/api/*` routes; free tier throttled.

## 2. Deployment Pipeline

1. **PR opens** → Vercel provisions a preview deployment; CI runs `npm run ci`; Playwright smoke tests run against the preview.
2. **PR approved and merged to `main`** → production deployment triggers automatically.
3. **Post-deploy smoke**: hit `/api/config`, `/api/v1/tiers`, `/api/v1/metrics`; confirm 200s.
4. **Rollback**: use the Vercel dashboard "Promote to Production" on the prior deployment; rollback is near-instant (immutable deployments).

## 3. Key Operational Procedures

### Rotating an AI Provider Key

See [`docs/ENVIRONMENT.md`](./ENVIRONMENT.md) §"Rotating a Leaked Key". Always add the new key before revoking the old one.

### Applying a Database Migration

1. Run the migration against a staging database first.
2. Verify behavior with preview deployment pointed at staging.
3. Run migration against production Supabase: `supabase db push`.
4. Deploy the code that depends on the migration *immediately after*. Migrations must be backward-compatible with the currently deployed code (additive columns/tables first, backfill, then cutover).

### Responding to an Incident

1. **Stabilize:** if an AI provider is failing hard, the circuit breaker will open automatically within ~5 failures; verify via `/api/v1/metrics`. If a bad deploy caused the regression, roll back in Vercel.
2. **Communicate:** if user-facing impact is > 5 minutes, post on the app's status channel and update `api/config` feature flags if needed to disable a specific module.
3. **Diagnose:** pull structured logs from Vercel; look for `[chat-ai]` and `[orchestrator]` scopes. The `modelsAttempted` array on errors tells you exactly which providers/keys were tried.
4. **Remediate:** fix forward on a branch; PR with regression test; merge and deploy.
5. **Post-mortem:** capture timeline, root cause, contributing factors, and action items.

### Feature Flags

Non-trivial rollouts should be gated by a flag in the `/api/config` response so features can be disabled without a redeploy.

## 4. Monitoring

| Surface | Tool | Signal |
|---|---|---|
| Edge function health | Vercel Analytics + `/api/v1/metrics` | 5xx rate, p95 latency |
| AI provider health | `/api/v1/metrics` → `providers`, `breakersOpen` | Circuit state, key rotations, per-provider error rate |
| Spend | Cost tracker in `packages/orchestrator/cost` | Per-provider spend snapshot (extend to push to billing dashboards) |
| Database | Supabase dashboard | CPU, connections, RLS denied events |
| Client errors | Vercel Analytics + `AppErrorBoundary` logging | Uncaught React errors |

## 5. Scaling Notes

- **Edge functions** scale automatically per request; the only shared state is in-memory counters (best-effort metrics) and Supabase (source of truth).
- **Rate limiting** is currently per-function-instance. For stricter global enforcement, plan to move the token bucket to Upstash/Redis or Supabase-backed state.
- **AI provider concurrency** is bounded by per-key lanes in `packages/orchestrator/providers/keyed-lane.ts`; add more keys to `OPENROUTER_API_KEYS` to raise the concurrency ceiling.
- **Free-tier economics** rely on Pollinations (zero-cost images) and Gemini Flash / OpenRouter free credits for chat. If free-tier usage grows, tighten `RATE_LIMIT_FREE_RPM` before promoting unpaid users to premium providers.

## 6. Compliance & Privacy

- **Referral tracking** uses HMAC-signed HttpOnly cookies and does not collect fingerprinting or raw IP for marketing purposes. See `src/components/referrals/` for the client flow and `api/referrals.ts` for server attribution.
- **Guest soft-gate** uses a signed cookie plus a local-storage marker (no PII).
- **No third-party analytics beyond Vercel Analytics** is bundled. When adding analytics, update the privacy notice.
- AI prompts sent to OpenRouter/Gemini/other providers include the user's content (topic, script, transcript) but never include Supabase JWTs or other secrets.

## 7. Disaster Recovery

- **Source of truth**: Supabase Postgres. Enable daily backups (Supabase Pro) and point-in-time recovery.
- **Infrastructure-as-code**: The Vercel project is reconstructable from this repository plus environment variables; nothing is configured only in the Vercel UI that isn't captured in `vercel.json`.
- **Recovery time objective**: < 30 minutes from a clean Vercel reconnect + Supabase restore.
- **Code rollback**: Vercel immutable deployments (one click).

## 8. Contact

- Operational issues: `support@tubeclickpro.in`
- Security disclosures: `security@tubeclickpro.in`
