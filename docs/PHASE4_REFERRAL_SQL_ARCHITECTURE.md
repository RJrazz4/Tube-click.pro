# PHASE 4 — Anti-Spam 2-Node Viral Referral Engine
## Supabase SQL Backend Architecture & Migration Plan

**Status:** AWAITING APPROVAL — no SQL has been executed, no migration file written.
**Predecessor:** Ghost Intelligence v3 (MP1-7), closed at `608f6eb`.
**Date:** 2026-08-14

---

## 0. Executive summary

Requirements 1, 2, and 4 are clean and I can implement them as specified.

**Requirement 5 ("Clean Slate") cannot be executed as literally worded**, and this
document explains why in section 1. Dropping the old referral tables would take
down the Ghost Intelligence arc shipped yesterday, along with two quota systems.
I propose a *functional* clean slate instead: destroy and rebuild every referral
**RPC**, but preserve the `referral_profiles` **table** that four unrelated
subsystems now depend on.

Requirement 3 needs one product decision from you before it can be finalised
(section 5.3) — device-based blocking has a false-positive mode that will
generate support tickets, and you should choose the tradeoff deliberately.

The audit also surfaced **two pre-existing bugs**, one of which will silently
break your 21-day expiry if we don't fix it in this arc. See section 2.

---

## 1. Why a literal "clean slate" is unsafe

`referral_profiles` is no longer a referral table. It has quietly become the
**central entitlement table** for the entire product. Seven migrations touch it:

```
202607210001_phase5_referrals.sql          -- creates it
202607210003_qualified_referral_chain.sql  -- adds pro_unlocked_at, pro_unlock_source
202607210004_referral_dashboard_...sql     -- dashboard access
202607260001_clone_crush_daily_quota.sql   -- READS pro_tier_expires_at for quota
202608130001_rolling_24h_quota.sql         -- READS pro_tier_expires_at for quota
202608140001_ghost_intel_ledger.sql        -- ADDS black_op_lane column; READS for tier
202608140005_ghost_dawn_patrol.sql         -- ADDS dawn_patrol_enabled, _send_hour
```

A `drop table public.referral_profiles cascade` would therefore:

1. Delete every user's **Black-Ops lane** entitlement (`black_op_lane`).
2. Delete every user's **Dawn Patrol** preferences (`dawn_patrol_enabled`,
   `dawn_patrol_send_hour`) — a feature shipped hours ago in MP6.
3. Cascade-drop `get_ghost_tier()`, breaking the **entire Ghost credit ledger**,
   since every metered Ghost action resolves tier through it.
4. Break `consume_clone_crush_run` and the rolling-24h quota system, both of
   which join `referral_profiles` to decide Pro status.
5. Revoke Pro from every existing paying/earning user with no backfill path.

**Recommendation:** functional clean slate, not physical. Concretely:

- **DROP** every referral RPC by name (they are pure logic; rebuilding is free).
- **DROP** `referral_events` and rebuild it — its schema is genuinely inadequate
  for the new anti-abuse model, and it holds only attribution history.
- **PRESERVE** `referral_profiles` as a table; **reset** its referral-specific
  columns; **leave untouched** the four columns owned by other subsystems.

This achieves your intent — no legacy referral logic survives, no conflicts —
without collateral damage. If you want the literal drop anyway, say so
explicitly and I will write it with a backfill script for the four foreign
columns, but I do not recommend it.

---

## 2. Pre-existing bugs found during the audit

### BUG-1 — `get_ghost_tier()` grants Pro to users with no profile row (critical)

```sql
select rp.pro_tier_expires_at into v_exp
  from public.referral_profiles rp where rp.user_id = uid;

v_is_pro := (v_exp is null or v_exp > now());   -- <-- defect
```

When no row exists, `SELECT ... INTO` leaves `v_exp` as `NULL`, and the
expression `v_exp is null` evaluates **true** — so the user is granted **Pro**.
The same `is null or > now()` pattern appears in the Clone Crush and rolling-24h
quota functions.

This directly sabotages Requirement 1. Your spec says Pro must **auto-expire to
Free after 21 days**. Under the current logic, any code path that clears
`pro_tier_expires_at` back to `NULL` — the intuitive way to express "no longer
Pro" — grants *permanent* Pro instead. The 21-day expiry must therefore be
encoded as a **timestamp in the past**, never as `NULL`, and the sentinel must
be fixed at the source.

**Fix:** treat `NULL` as "never had Pro" = Free. Requires updating three
functions. In scope for this arc because Requirement 1 cannot be met otherwise.

### BUG-2 — inconsistent Pro definition across subsystems

Two different rules are live simultaneously:

| Function | Pro test |
|---|---|
| `get_ghost_tier` | `pro_tier_expires_at is null or > now()` |
| `consume_clone_crush_run` | `pro_unlocked_at is not null AND (expires is null or > now())` |
| `get_pro_entitlement` | `pro_tier_expires_at is not null and > now()` |

Three definitions, three different answers for the same user. `get_pro_entitlement`
(what the frontend reads) is the only correct one. **Fix:** collapse all callers
onto a single `public.is_pro(uuid)` helper so entitlement has exactly one
definition.

---

## 3. Schema design

### 3.1 `referral_profiles` — preserved, columns reset

Retained as-is (owned by other subsystems, must not be touched):
`user_id`, `black_op_lane`, `dawn_patrol_enabled`, `dawn_patrol_send_hour`,
`pro_tier_expires_at`, `pro_unlocked_at`, `pro_unlock_source`, `referral_code`.

Reset to zero for the new engine: `verified_referrals`, `friends_unlocked_pro`.

New columns:

| Column | Type | Purpose |
|---|---|---|
| `qualified_referrals` | `int not null default 0` | Count of proof-of-work-qualified referrals. Drives the 2-node milestone. |
| `lifetime_pro_days_granted` | `int not null default 0` | Hard cap enforcement — bounds total liability per referrer. |
| `referral_banned_at` | `timestamptz` | Set when a ring/farm is confirmed; suppresses all future accrual. |

### 3.2 `referral_attributions` — replaces `referral_events`

One row per invitee, holding the full attribution lifecycle. The old table
keyed anti-abuse solely on `ip_hash`, which is defeated by mobile tethering.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid pk` | |
| `referrer_id` | `uuid not null` | → `auth.users` |
| `invitee_id` | `uuid not null unique` | **Unique** — one invitee can never be attributed twice |
| `ref_code` | `varchar(12) not null` | |
| `status` | `text not null` | `pending` → `qualified` \| `rejected` |
| `qualified_at` | `timestamptz` | Set when proof-of-work fires |
| `qualifying_action` | `text` | Which core action proved humanity |
| `ip_hash` | `varchar(64)` | SHA-256, salted server-side |
| `device_hash` | `varchar(64)` | Client fingerprint, salted server-side |
| `email_domain` | `text` | For disposable-domain checks |
| `signup_ip_hash` | `varchar(64)` | Captured at signup, immutable |
| `risk_score` | `int not null default 0` | 0-100 composite |
| `rejection_reason` | `text` | **Server-side only — never returned to client** |
| `created_at` | `timestamptz not null default now()` | |

Constraints and indexes:

```
unique (invitee_id)                             -- single-attribution invariant
unique (referrer_id, device_hash) where status = 'qualified'
unique (referrer_id, ip_hash)     where status = 'qualified'
check  (referrer_id <> invitee_id)              -- self-referral, at DB level
index  (referrer_id, status)
index  (created_at)                             -- velocity queries
```

The two partial unique indexes are the core of Requirement 3: they make it
**physically impossible** for one referrer to bank two qualified referrals from
the same device or the same IP. This is enforced by the storage engine, not by
application logic, so it cannot be bypassed by any client.

### 3.3 `referral_pro_grants` — audit ledger

Append-only record of every Pro grant: `user_id`, `granted_days` (21),
`granted_at`, `expires_at`, `reason`, `triggering_attribution_id`, `revoked_at`.

This exists so that a fraudulent grant can be **revoked with a precise audit
trail** rather than by hand-editing entitlement columns, and so support can
answer "why does this user have Pro?".

---

## 4. RPC surface (all `SECURITY DEFINER`, `search_path = public, pg_temp`)

| RPC | Caller | Purpose |
|---|---|---|
| `is_pro(uuid)` | internal | **Single** entitlement definition. Fixes BUG-1/BUG-2. |
| `attach_referral(p_ref_code, p_device_hash, p_ip_hash, p_email_domain)` | service_role | Records `pending` attribution at signup. Runs all cheap rejections. Returns opaque `{attached: bool}`. |
| `qualify_referral(p_invitee_id, p_action)` | service_role | **Proof-of-work hook.** Flips `pending` → `qualified`, re-runs abuse checks, evaluates the 2-node milestone, grants 21 days. Idempotent. |
| `get_referral_dashboard(p_user_id)` | authenticated | Rebuilt. Returns progress only — never rejection reasons. |
| `get_pro_entitlement(p_user_id)` | authenticated | Rebuilt on `is_pro`. |
| `expire_pro_grants()` | cron | Sweeps expired grants to Free. |
| `admin_revoke_referral(p_attribution_id, p_reason)` | service_role | Fraud response with audit trail. |

Dropped: `claim_referral_reward`, `evaluate_qualified_referral_chain`,
`record_referral_click`, plus the old `get_referral_dashboard` /
`get_pro_entitlement`. `admin_grant_seed_pro` is retained (service-role only).

### 4.1 The 21-day grant (Requirement 1)

Triggered inside `qualify_referral` when `qualified_referrals` reaches **2**:

```
expires_at := greatest(now(), coalesce(current_expiry, now())) + interval '21 days'
```

Using `greatest(...)` means a user who already has Pro gets it **extended**
rather than truncated. Expiry is always a concrete timestamp — never `NULL` —
per BUG-1. Auto-expiry is enforced two ways: `is_pro()` compares against `now()`
on every read (so expiry is instant and self-enforcing even if cron dies), and
`expire_pro_grants()` sweeps hourly to keep stored state tidy.

### 4.2 Proof-of-work (Requirement 2)

`qualify_referral` is called from the **server side** of core actions, after the
action succeeds. The natural integration point already exists: `consume_ghost_action`
in the Ghost ledger is the single choke point every metered Ghost action passes
through, so qualification hooks in there rather than being scattered across routes.

Qualifying actions (proposed): `interrogate`, `squad`, `recon`, `clone_crush_run`.
Explicitly **not** qualifying: signup, email verification, login, page views.

Signature requires the invitee to have performed the action *themselves*, and
because `consume_ghost_action` already resolves identity through the MP7 unified
auth layer, the user id is trustworthy.

### 4.3 Cross-device persistence (Requirement 4)

Every table keys on `user_id` (`uuid → auth.users`). No state is held in
`localStorage`, cookies, or device storage. `device_hash` is used **only** as an
anti-abuse signal, never as an identity key. Consequence: a user logging in on a
new device sees identical referral progress and Pro status, because both are
derived server-side from `user_id` alone.

---

## 5. Anti-abuse model (Requirement 3)

### 5.1 Layered defence

| Layer | Control | Defeats |
|---|---|---|
| 0 | `check (referrer_id <> invitee_id)` | Self-referral |
| 1 | `unique (invitee_id)` | Double attribution |
| 2 | `unique (referrer_id, device_hash) where qualified` | Same-device farming |
| 3 | `unique (referrer_id, ip_hash) where qualified` | Same-network farming |
| 4 | Disposable-domain check (table-driven, not hardcoded) | Throwaway email |
| 5 | Proof-of-work | Drive-by signups |
| 6 | Velocity limit — max N qualified/24h per referrer | Burst farming |
| 7 | Reciprocity detection — A→B and B→A | 2-cycles |
| 8 | `lifetime_pro_days_granted` cap | Unbounded liability |

Layers 0-3 are **storage-level invariants**. Layers 4-8 are logic inside
`SECURITY DEFINER` functions the client cannot call directly.

### 5.2 Silent failure

Rejections return an **opaque** result. `rejection_reason` is written to the
table for operators but never surfaced. The current live system returns
`disposable_email` / `network_duplicate` to the client, which tells an attacker
exactly which probe tripped and lets them iterate. That leak closes here.

### 5.3 DECISION REQUIRED — device/IP blocking strictness

Layer 3 (IP uniqueness) has a real false-positive mode: **a university dorm, an
office, or a shared household NAT** all present one IP. Under strict blocking,
a creator who legitimately refers three flatmates banks only one referral.

| Option | Behaviour | Trade-off |
|---|---|---|
| **A. Strict** | Hard-block duplicate IP (current live behaviour) | Max security; will generate "my referral didn't count" tickets |
| **B. Device-strict, IP-soft** | Hard-block duplicate device; duplicate IP only adds risk score | Balanced — recommended |
| **C. Risk-scored** | Nothing hard-blocks; accumulate score, hold for review above threshold | Fewest false positives; needs a review queue you must staff |

**My recommendation: Option B.** Device duplication is a far stronger fraud
signal than IP duplication, and it does not punish shared-network households.

---

## 6. Migration plan

Single migration, `202608140006_antispam_2node_referral_engine.sql`, in eight
transactional steps:

1. **Drop legacy RPCs** by explicit name (no `cascade` on tables).
2. **Create `is_pro()`** — the one true entitlement definition.
3. **Patch BUG-1/BUG-2** — repoint `get_ghost_tier`, `consume_clone_crush_run`,
   and the rolling-24h functions onto `is_pro()`.
4. **Reset referral columns** on `referral_profiles`; add the three new ones.
   Other subsystems' columns untouched.
5. **Drop `referral_events`; create `referral_attributions`** with all
   constraints and indexes.
6. **Create `referral_pro_grants`** audit ledger.
7. **Create the new RPC surface**; apply RLS (self-select on profile only;
   attributions and grants fully revoked from `anon`/`authenticated`).
8. **Schedule `expire_pro_grants()`** hourly via pg_cron.

**Rollback:** the migration is authored so every step is reversible except the
`referral_events` drop; a companion script snapshots that table to
`referral_events_archive_202608` before dropping, so attribution history is
recoverable.

**Verification gates** (must be green before push): `npm run typecheck` ·
`npm run verify` (4 gates) · `vite build` · new SQL assertion tests covering
the 21-day arithmetic, `NULL`-expiry-is-Free, single-attribution, device/IP
uniqueness, proof-of-work gating, and idempotency of `qualify_referral`.

---

## 7. Approval checklist

Reply to confirm and I will write and ship the migration:

1. **Clean slate scope** — approve *functional* reset (preserve
   `referral_profiles`, drop all referral RPCs + `referral_events`)? Or do you
   insist on the literal table drop with a backfill script?
2. **BUG-1/BUG-2 fix** — approve fixing entitlement inside this arc? Required
   for the 21-day expiry to work at all.
3. **Anti-abuse strictness** — Option A, B, or **C**? (I recommend **B**.)
4. **Qualifying actions** — confirm `interrogate`, `squad`, `recon`,
   `clone_crush_run` as proof-of-work.
5. **Lifetime cap** — what is the maximum total Pro days one referrer may ever
   earn? (Proposed: 180 days.)
6. **Existing users** — grandfather anyone mid-progress under the old 3-invite
   rule, or reset everyone to zero under the new 2-node rule?
