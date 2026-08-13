# Ghost Intelligence Catch-Up — Apply Guide

Project: `cssnxomfkrnjaedoobjj` · Apply via the Supabase SQL Editor. There is no
deploy automation; a git push does **not** apply schema.

---

## What's wrong right now

Production contains exactly four tables:

```
referral_attributions   referral_blocked_domains
referral_pro_grants     referral_profiles
```

Those are precisely what `202608140006_antispam_2node_referral_engine.sql`
creates. It is the **only** migration ever applied. Consequences:

| Subsystem | Table | State |
|---|---|---|
| Ghost credit ledger | `ghost_usage` | missing |
| Ghost Interrogate | `ghost_memory_chunks` | missing |
| Ghost Squad | `ghost_squad_briefs` | missing |
| Visual Recon | `ghost_recon_frames` | missing |
| Dawn Patrol | `ghost_dawn_patrol_briefs` | missing |
| Clone & Crush quota | `daily_usage` | missing |

`api/_ghostLedger.ts` calls `get_ghost_quota` and `consume_ghost_action`, which
do not exist. Every metered Ghost action is failing in production.

The 2-node referral engine itself **is** correctly installed and working.

---

## Why you cannot just replay 202608140001–005

Migration 006 is newer than the Ghost migrations but was applied first.
Replaying the older files on top of it reintroduces defects that 006 fixes.
Both were reproduced on a local PostgreSQL 17 rebuild of your exact production
state before the repair was written.

### Defect 1 — free users get Pro (critical, revenue-affecting)

`202608140001` and `202608140005` define `get_ghost_tier_for()` using the old
rule `v_is_pro := (v_exp is null or v_exp > now())`. A new free user has
`pro_tier_expires_at = NULL`, so that returns **true**. Measured after a naive
chronological replay:

```
is_pro('<free user>')             -> f            (correct)
get_ghost_tier_for('<free user>') -> {"tier":"pro"}   <-- WRONG
```

Every free user would receive Pro-tier Ghost limits. This is BUG-1, already
fixed by 006 STEP 6/7 — the replay silently undoes it.

### Defect 2 — Dawn Patrol has never worked

`202608140005` reads `rp.niche`, a column **no migration in the repo creates**.
`ghost_dawn_patrol_due_users()` therefore throws
`ERROR: column rp.niche does not exist` on every call. This is pre-existing: it
fails identically on a clean full-chain replay.

### Defect 3 — Dawn Patrol would bill the entire free base

The same NULL-expiry filter appears in `ghost_dawn_patrol_due_users()`. Once
defect 2 is fixed, a brand-new free profile is returned as "due" for a brief —
a Pro feature generated for every free user. Caught during verification of
this repair, not present in any earlier audit.

### Defect 4 — Clone & Crush disagrees on entitlement

006's header comment claims it repoints the Clone & Crush functions onto
`is_pro()`, but it never redefines them (verified: 0 occurrences). They use
`pro_unlocked_at is not null and (expiry is null or expiry > now())`, which
disagrees with `is_pro()` whenever expiry is NULL.

All four are repaired by the catch-up script.

---

## Apply

### Step 1 — back up

Supabase Dashboard → Database → Backups → confirm a recent point-in-time
restore point exists.

### Step 2 — run the catch-up

Paste **`SUPABASE_CATCHUP_GHOST_FULL.sql`** (the generated bundle with all five
migrations inlined) into the SQL Editor and run it.

- Wrapped in `begin … commit` — all-or-nothing.
- Idempotent; verified clean across three consecutive runs.
- Creates no duplicate rows and modifies no existing row.
- Expect `NOTICE … already exists, skipping` lines. Those are normal.

`SUPABASE_CATCHUP_GHOST.sql` is the same script with the five migrations
referenced rather than inlined — read that one to review the logic.

### Step 3 — verify (all five must pass)

```sql
-- V1  expect 10 rows
select tablename from pg_tables where schemaname='public' order by 1;

-- V2  expect is_pro=f and ghost_tier='free' for every row
select rp.user_id,
       public.is_pro(rp.user_id)                       as is_pro,
       public.get_ghost_tier_for(rp.user_id) ->> 'tier' as ghost_tier
  from public.referral_profiles rp
 where rp.pro_tier_expires_at is null
 limit 5;

-- V3  expect a jsonb array (usually []), NOT an error
select public.ghost_dawn_patrol_due_users(7);

-- V4  expect 3 rows
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'
   and proname in ('get_ghost_quota','consume_ghost_action','register_core_action')
 order by 1;

-- V5  expect 0 rows
select tablename, policyname, cmd from pg_policies
 where schemaname='public'
   and ((qual ~* 'auth\.(uid|jwt|role)\(\)' and qual !~* 'select\s+auth\.')
     or (with_check ~* 'auth\.(uid|jwt|role)\(\)' and with_check !~* 'select\s+auth\.'));
```

### Step 4 — RLS

V5 should already return 0; the catch-up creates policies in the InitPlan form.
If it returns rows, run `SUPABASE_PATCH_RLS_INITPLAN.sql` once.

---

## Do NOT run

`202607210001` – `202607210004` and `supabase/combined_referrals.sql`.

They recreate `referral_events` and the legacy
`claim_referral_reward` / `evaluate_qualified_referral_chain` surface that 006
deliberately dropped. Running them would corrupt the 2-node engine.

---

## Verification performed

Rebuilt production exactly (harness + migration 006 → 4 tables), then applied
the catch-up on PostgreSQL 17.10.

| Gate | Result |
|---|---|
| Catch-up applies clean | pass |
| Idempotent, 3 consecutive runs | pass |
| V1 — 10 tables | pass |
| V2 — free user is_pro=f, tier=free | pass |
| V2 — Pro user (+21d) is_pro=t, tier=pro | pass |
| V2 — expired user is_pro=f, tier=free | pass |
| V3 — free user NOT due for Dawn Patrol | pass (`[]`) |
| V3 — Pro user IS due, niche populated | pass |
| V4 — 3 Ghost RPCs present | pass |
| V5 — 0 unwrapped RLS policies, 7 total | pass |
| End-to-end 2-node: signup alone grants nothing | pass |
| End-to-end 2-node: 2 × proof-of-work → Pro, 21 days | pass |
| Full 12-migration chain still clean | pass |
| `tsc --noEmit` | 0 errors |
| `vitest run` | 61 files, 537 tests passed |

One repo change accompanies this: `202608140001_ghost_intel_ledger.sql` had a
bare `create type public.ghost_action` (no `IF NOT EXISTS` form exists for
`CREATE TYPE`), which made re-runs fail. It is now guarded by a `DO` block.
