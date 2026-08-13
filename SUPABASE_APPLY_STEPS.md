# Applying the 2-Node Referral Engine to Supabase

**Project:** `cssnxomfkrnjaedoobjj`
**File to paste:** `SUPABASE_APPLY.sql` (repo root)
**Code prerequisite:** commit `4bef2a3` deployed — see step 1.

---

## Order matters

The SQL drops `claim_referral_reward` and `record_referral_click`. Application
builds older than `4bef2a3` still call both. If you run the SQL first, referral
capture breaks until the deploy finishes.

**Deploy the code first, then run the SQL.**

---

## Step 1 — Confirm the code is live

Vercel auto-deploys on push to `main`. Before running anything:

1. Open your Vercel dashboard for the project.
2. Confirm the most recent deployment is **Ready** and its commit is
   `4bef2a3` (or newer).
3. If it is still building, wait. Do not proceed while it is in progress.

---

## Step 2 — Paste and run the SQL

1. Open the Supabase dashboard for project `cssnxomfkrnjaedoobjj`.
2. Go to **SQL Editor** → **New query**.
3. Open `SUPABASE_APPLY.sql` from the repo root, copy its **entire** contents,
   and paste into the editor.
4. Click **Run**.

Expected result: `Success. No rows returned`.

`NOTICE` lines are normal and safe — they report objects that already existed
and were skipped. Only a red `ERROR` matters.

The script is idempotent. If you are unsure whether it completed, run it again;
a second run is a no-op.

---

## Step 3 — Verify it worked

Run this in a new SQL Editor query. Every row should read `PASS`.

```sql
select 'PASS — tables' as check, count(*)::text as detail
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('referral_profiles','referral_attributions',
                      'referral_pro_grants','referral_blocked_domains')
having count(*) = 4
union all
select 'PASS — functions', count(*)::text
  from information_schema.routines
 where routine_schema = 'public'
   and routine_name in ('is_pro','attach_referral','qualify_referral',
                        'register_core_action','validate_referral_code',
                        'get_referral_dashboard','get_pro_entitlement',
                        'expire_pro_grants','admin_revoke_referral')
having count(*) = 9
union all
select 'PASS — legacy RPCs removed', 'none'
 where not exists (
   select 1 from information_schema.routines
    where routine_schema = 'public'
      and routine_name in ('claim_referral_reward','record_referral_click',
                           'evaluate_qualified_referral_chain'))
union all
select 'PASS — economics 2/21/180',
       (public.referral_config()->>'required_qualified_referrals') || '/' ||
       (public.referral_config()->>'grant_days') || '/' ||
       (public.referral_config()->>'lifetime_day_cap')
 where public.referral_config()->>'required_qualified_referrals' = '2'
   and public.referral_config()->>'grant_days' = '21'
   and public.referral_config()->>'lifetime_day_cap' = '180'
union all
select 'PASS — ghost ledger intact',
       public.get_ghost_tier_for('00000000-0000-0000-0000-000000000000')->>'tier'
 where (public.get_ghost_tier_for('00000000-0000-0000-0000-000000000000')->>'tier') = 'free';
```

Five `PASS` rows means the engine is live and the Ghost subsystems survived.

The last check matters most: it confirms an unknown user resolves to **free**,
not **pro**. That was the pre-existing entitlement defect this migration fixes.

---

## Step 4 — Smoke test in the product

1. Copy your referral link from the **Rewards** page.
2. Open it in a private window and sign up with a different email.
3. Check your Rewards page: the invite appears as **pending**, and you have
   **not** received Pro. This is correct — signing up earns nothing.
4. As the invited user, run one core action (interrogate a URL, a squad
   dossier, visual recon, or a Clone Crush run).
5. Your dashboard now shows **1 qualified**. Still no Pro.
6. Repeat with a second person on a **different device**. At 2 qualified,
   21 days of Pro activates automatically.

Testing both invites on the same device will not work — that is the
device-strict anti-abuse control doing its job.

---

## Optional — enable the Dawn Patrol cron

Part 2 of the script schedules the hourly briefing dispatch, but only if the
`pg_cron` and `pg_net` extensions are enabled. To turn it on:

1. **Database** → **Extensions**, enable `pg_cron` and `pg_net`.
2. Set the webhook configuration (replace with your real values):

```sql
alter database postgres set app.dawn_patrol_webhook_url =
  'https://tubeclickpro.in/api/ghost/dawn-patrol-cron';
alter database postgres set app.dawn_patrol_cron_secret = '<your CRON_SECRET>';
```

3. Re-run **Part 2** of `SUPABASE_APPLY.sql`.
4. Confirm the job exists:

```sql
select jobname, schedule, active from cron.job
 where jobname = 'ghost-dawn-patrol-dispatch';
```

Without this, Dawn Patrol still works — the client triggers a lazy generate on
first dashboard load each day.

---

## If something goes wrong

**A red ERROR appears.** Stop and send me the message. Nothing is partially
applied in a harmful way; the script can be safely re-run after a fix.

**Referral capture breaks after applying.** The code deploy did not land first.
Confirm Vercel is serving `4bef2a3` or newer, then hard-refresh.

**A verification row is missing.** Re-run the script — it is idempotent — then
re-run the verification query.

---

## What this changes

| Before | After |
|---|---|
| 3 invites + 1 friend unlocking Pro | 2 qualified referrals |
| Signup counted toward the reward | Signup earns nothing; a core action is required |
| 7-day Pro pass | 21-day Pro pass |
| Unbounded accumulation | 180-day lifetime cap per referrer |
| Rejection reasons returned to client | Opaque responses; reasons logged server-side |
| Same-IP signups hard-blocked | Device-strict; shared Wi-Fi allowed |
| NULL expiry granted permanent Pro | NULL expiry means Free |
| Three conflicting definitions of "is Pro" | One definition, `is_pro()` |
