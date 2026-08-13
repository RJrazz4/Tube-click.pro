-- ###########################################################################
-- TubeClick Pro — APPLY THIS IN THE SUPABASE SQL EDITOR
--
-- Contents:
--   PART 1  Anti-Spam 2-Node Viral Referral Engine (migration 202608140006)
--   PART 2  Dawn Patrol cron dispatch fix          (migration 202608140005)
--
-- Safe to run as a single statement batch. Idempotent: re-running is a no-op.
--
-- PREREQUISITE: deploy the application code FIRST (commit 4bef2a3 or later).
-- This script drops claim_referral_reward and record_referral_click. Older
-- app builds still call those and will break the moment this runs.
-- ###########################################################################

-- ###########################################################################
-- PART 1 — Anti-Spam 2-Node Viral Referral Engine
-- ###########################################################################

-- ===========================================================================
-- PHASE 4 — Anti-Spam 2-Node Viral Referral Engine
-- ===========================================================================
--
-- Clean-slate rebuild of the referral subsystem, approved on the basis that
-- the platform has zero live users. This migration is intentionally
-- destructive toward referral data and rebuilds the surface from scratch.
--
-- APPROVED DECISIONS
--   1. Clean slate      — full teardown of referral tables; no back-compat.
--   2. Expiry           — strict 21-day grant that drops to Free; no NULL
--                         loophole granting permanent Pro.
--   3. Anti-abuse       — device-strict, IP-soft.
--   4. Lifetime cap     — 180 Pro days maximum per referrer.
--   5. Existing users   — none; counters start at zero.
--
-- ---------------------------------------------------------------------------
-- CRITICAL IMPLEMENTATION NOTE — why referral_profiles is rebuilt, not dropped
--   and forgotten.
--
-- In PostgreSQL, dropping a table does NOT drop plpgsql functions that
-- reference it. Function bodies are not dependency-tracked; they are parsed
-- at execution time. Four subsystems shipped in earlier arcs read columns off
-- referral_profiles:
--
--   get_ghost_tier / get_ghost_tier_for      -> pro_tier_expires_at, black_op_lane
--   consume_clone_crush_run / get_..._quota  -> pro_unlocked_at, pro_tier_expires_at
--   rolling-24h quota functions              -> pro_unlocked_at, pro_tier_expires_at
--   dawn patrol config/dispatch              -> dawn_patrol_enabled, dawn_patrol_send_hour
--
-- If we dropped the table and recreated it with only the new referral
-- columns, those functions would compile fine and then fail at RUNTIME with
-- "column does not exist" — taking down the Ghost ledger, both quota systems,
-- and Dawn Patrol. The table is therefore recreated with the COMPLETE column
-- contract those subsystems expect. This is not legacy cruft; it is the
-- entitlement surface the rest of the product reads.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ===========================================================================
-- STEP 1 — Tear down the legacy referral surface.
-- ===========================================================================
-- Functions are dropped explicitly by signature so a rename or signature
-- drift in a future arc surfaces as an error rather than leaving an
-- orphaned, callable copy of superseded logic.

drop trigger if exists create_referral_profile_after_signup on auth.users;

drop function if exists public.claim_referral_reward(text, uuid, text, text) cascade;
drop function if exists public.evaluate_qualified_referral_chain(uuid, integer) cascade;
drop function if exists public.record_referral_click(text, text) cascade;
drop function if exists public.get_referral_dashboard(uuid) cascade;
drop function if exists public.get_pro_entitlement(uuid) cascade;
drop function if exists public.get_or_create_referral_profile(uuid) cascade;
drop function if exists public.create_referral_profile_for_user() cascade;
drop function if exists public.admin_grant_seed_pro(uuid, integer) cascade;

drop table if exists public.referral_events cascade;
drop table if exists public.referral_profiles cascade;

-- ===========================================================================
-- STEP 2 — referral_profiles, rebuilt with the full column contract.
-- ===========================================================================

create table if not exists public.referral_profiles (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null unique references auth.users(id) on delete cascade,

  -- Referral identity ------------------------------------------------------
  referral_code               varchar(12) not null unique
                                default ('TC_' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))),

  -- 2-Node progress counters ----------------------------------------------
  total_invites               integer not null default 0 check (total_invites >= 0),
  qualified_referrals         integer not null default 0 check (qualified_referrals >= 0),

  -- Pro entitlement --------------------------------------------------------
  -- pro_tier_expires_at is the single source of truth for Pro. It is ALWAYS
  -- a concrete timestamp once Pro has ever been granted. NULL means "never
  -- granted" and is treated as Free — see is_pro() and the BUG-1 note.
  pro_tier_expires_at         timestamptz,
  pro_unlocked_at             timestamptz,
  pro_unlock_source           varchar(20)
                                check (pro_unlock_source in ('referral_2node', 'admin_seed', 'purchase')),

  -- Liability cap (decision 4) --------------------------------------------
  lifetime_pro_days_granted   integer not null default 0
                                check (lifetime_pro_days_granted >= 0),

  -- Abuse suppression ------------------------------------------------------
  referral_banned_at          timestamptz,
  referral_ban_reason         text,

  -- Columns owned by OTHER subsystems. Recreated verbatim because their
  -- functions read them at runtime. Do not remove without migrating those.
  black_op_lane               boolean not null default false,   -- ghost intel ledger
  dawn_patrol_enabled         boolean not null default true,    -- dawn patrol
  dawn_patrol_send_hour       integer not null default 7        -- dawn patrol
                                check (dawn_patrol_send_hour between 0 and 23),

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on column public.referral_profiles.pro_tier_expires_at is
  'Single source of truth for Pro. NULL = never granted = Free. Never set back to NULL to revoke; set to a past timestamp.';
comment on column public.referral_profiles.black_op_lane is
  'Owned by ghost_intel_ledger. Elevates ghost caps beyond Pro.';
comment on column public.referral_profiles.lifetime_pro_days_granted is
  'Cumulative referral-earned Pro days. Hard-capped at 180 (REFERRAL_LIFETIME_DAY_CAP).';

create index if not exists referral_profiles_code_idx on public.referral_profiles (referral_code);
create index if not exists referral_profiles_expiry_idx on public.referral_profiles (pro_tier_expires_at)
  where pro_tier_expires_at is not null;

-- ===========================================================================
-- STEP 3 — referral_attributions: one row per invitee, full lifecycle.
-- ===========================================================================

create table if not exists public.referral_attributions (
  id                  uuid primary key default gen_random_uuid(),
  referrer_id         uuid not null references auth.users(id) on delete cascade,
  invitee_id          uuid not null references auth.users(id) on delete cascade,
  ref_code            varchar(12) not null,

  status              text not null default 'pending'
                        check (status in ('pending', 'qualified', 'rejected')),
  qualified_at        timestamptz,
  qualifying_action   text,

  -- Abuse signals. Hashes are salted server-side before they ever reach the
  -- database; raw IPs and raw device fingerprints are never stored.
  device_hash         varchar(64),
  ip_hash             varchar(64),
  email_domain        text,

  risk_score          integer not null default 0 check (risk_score between 0 and 100),

  -- Operator-only. Deliberately never returned to the client: exposing which
  -- specific control tripped lets an attacker iterate against the detector.
  rejection_reason    text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Self-referral is impossible at the storage layer, not merely in logic.
  constraint referral_attributions_no_self check (referrer_id <> invitee_id)
);

-- An invitee can be attributed to exactly one referrer, ever. Enforced by the
-- storage engine, so no application path can double-attribute.
create unique index if not exists referral_attributions_invitee_unique
  on public.referral_attributions (invitee_id);

-- DEVICE-STRICT (decision 3): one referrer may never bank two QUALIFIED
-- referrals from the same device. This is the primary anti-farm control —
-- device duplication is a far stronger fraud signal than IP duplication.
create unique index if not exists referral_attributions_device_strict
  on public.referral_attributions (referrer_id, device_hash)
  where status = 'qualified' and device_hash is not null;

-- NOTE: there is deliberately NO unique index on (referrer_id, ip_hash).
-- IP-SOFT (decision 3): shared NAT — households, dorms, offices, mobile
-- carriers — legitimately produces many users behind one IP. Duplicate IPs
-- raise risk_score instead of hard-blocking. See apply_risk_signals().

create index if not exists referral_attributions_referrer_status_idx
  on public.referral_attributions (referrer_id, status);
create index if not exists referral_attributions_created_idx
  on public.referral_attributions (created_at desc);
create index if not exists referral_attributions_ip_idx
  on public.referral_attributions (referrer_id, ip_hash)
  where ip_hash is not null;

-- ===========================================================================
-- STEP 4 — referral_pro_grants: append-only audit ledger.
-- ===========================================================================
-- Every Pro grant is recorded so a fraudulent grant can be revoked with a
-- precise trail, and so support can answer "why does this user have Pro?"
-- without inspecting mutable entitlement columns.

create table if not exists public.referral_pro_grants (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  granted_days              integer not null check (granted_days > 0),
  granted_at                timestamptz not null default now(),
  expires_at                timestamptz not null,
  reason                    text not null,
  triggering_attribution_id uuid references public.referral_attributions(id) on delete set null,
  revoked_at                timestamptz,
  revoke_reason             text
);

create index if not exists referral_pro_grants_user_idx on public.referral_pro_grants (user_id, granted_at desc);
create index if not exists referral_pro_grants_active_idx on public.referral_pro_grants (expires_at)
  where revoked_at is null;

-- ===========================================================================
-- STEP 5 — Tunable constants.
-- ===========================================================================
-- Centralised so economics can be retuned without editing logic in six places.

create or replace function public.referral_config()
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'required_qualified_referrals', 2,      -- 2-Node milestone
    'grant_days',                   21,     -- 21 days of Pro
    'lifetime_day_cap',             180,    -- decision 4
    'max_qualified_per_24h',        5,      -- velocity limit
    'ip_soft_risk_increment',       25,     -- IP-soft penalty
    'risk_reject_threshold',        80      -- score at/above which we silently reject
  );
$$;

revoke all on function public.referral_config() from public, anon, authenticated;

-- ===========================================================================
-- STEP 6 — is_pro(): THE single entitlement definition. Fixes BUG-1 + BUG-2.
-- ===========================================================================
--
-- BUG-1 (critical, pre-existing): get_ghost_tier used
--     v_is_pro := (v_exp is null or v_exp > now());
-- When SELECT ... INTO matched no row, v_exp stayed NULL and the expression
-- evaluated TRUE — granting Pro to users with no profile, and granting
-- PERMANENT Pro to anyone whose expiry was reset to NULL. That directly
-- defeats requirement 1 (auto-expire to Free after 21 days).
--
-- BUG-2 (pre-existing): three subsystems each defined "is Pro" differently,
-- so the same user could be Pro to one and Free to another.
--
-- Correct semantics, now defined exactly once:
--     NULL expiry          -> never granted -> FREE
--     expiry <= now()      -> lapsed        -> FREE
--     expiry >  now()      -> active        -> PRO

create or replace function public.is_pro(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select rp.pro_tier_expires_at is not null
        and rp.pro_tier_expires_at > now()
       from public.referral_profiles rp
      where rp.user_id = p_user_id),
    false
  );
$$;

comment on function public.is_pro(uuid) is
  'Single source of truth for Pro entitlement. NULL expiry = Free (fixes the NULL-grants-Pro defect).';

revoke all on function public.is_pro(uuid) from public, anon;
grant execute on function public.is_pro(uuid) to authenticated, service_role;

-- ===========================================================================
-- STEP 7 — Repoint existing subsystems onto is_pro().
-- ===========================================================================
-- Bodies are replaced in place so the Ghost ledger, Clone Crush, and the
-- rolling-24h quotas all resolve entitlement identically. Signatures and
-- return shapes are preserved exactly — no caller changes required.

create or replace function public.get_ghost_tier_for(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_pro boolean;
  v_black  boolean;
begin
  if p_user_id is null then
    return jsonb_build_object('tier', 'guest', 'is_black_ops', false);
  end if;

  v_is_pro := public.is_pro(p_user_id);

  select coalesce(rp.black_op_lane, false)
    into v_black
    from public.referral_profiles rp
   where rp.user_id = p_user_id;

  -- Black-ops is meaningless without an active Pro subscription.
  v_black := coalesce(v_black, false) and v_is_pro;

  return jsonb_build_object(
    'tier', case when v_is_pro then 'pro' else 'free' end,
    'is_black_ops', v_black
  );
end;
$$;

create or replace function public.get_ghost_tier()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return public.get_ghost_tier_for(auth.uid());
end;
$$;

revoke all on function public.get_ghost_tier() from public, anon;
grant execute on function public.get_ghost_tier() to authenticated, service_role;
revoke all on function public.get_ghost_tier_for(uuid) from public, anon, authenticated;
grant execute on function public.get_ghost_tier_for(uuid) to service_role;

-- ===========================================================================
-- STEP 8 — Profile provisioning.
-- ===========================================================================

create or replace function public.get_or_create_referral_profile(p_user_id uuid)
returns public.referral_profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.referral_profiles;
begin
  insert into public.referral_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do update set updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke all on function public.get_or_create_referral_profile(uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_referral_profile(uuid) to service_role;

create or replace function public.create_referral_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.referral_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_referral_profile_for_user() from public, anon, authenticated;

drop trigger if exists create_referral_profile_after_signup on auth.users;
create trigger create_referral_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_referral_profile_for_user();

-- Zero live users, but idempotent and harmless.
insert into public.referral_profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ===========================================================================
-- STEP 9 — attach_referral(): signup-time attribution (status = pending).
-- ===========================================================================
-- Requirement 2: signing up NEVER earns the referrer anything. This records
-- the linkage only. Credit is granted later, by qualify_referral(), and only
-- after the invitee performs real work.
--
-- Returns an OPAQUE result. The caller learns only whether a link was
-- recorded, never which control rejected it.

create or replace function public.attach_referral(
  p_invitee_id   uuid,
  p_ref_code     text,
  p_device_hash  text default null,
  p_ip_hash      text default null,
  p_email_domain text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_referrer   public.referral_profiles;
  v_risk       integer := 0;
  v_reason     text := null;
  v_cfg        jsonb := public.referral_config();
  v_disposable boolean := false;
begin
  if p_invitee_id is null or p_ref_code is null or length(trim(p_ref_code)) = 0 then
    return jsonb_build_object('attached', false);
  end if;

  select * into v_referrer
    from public.referral_profiles
   where referral_code = upper(trim(p_ref_code))
   for update;

  if v_referrer.user_id is null then
    return jsonb_build_object('attached', false);           -- invalid code
  end if;

  if v_referrer.user_id = p_invitee_id then
    return jsonb_build_object('attached', false);           -- self-referral
  end if;

  if v_referrer.referral_banned_at is not null then
    return jsonb_build_object('attached', false);           -- banned referrer
  end if;

  -- Already attributed? The unique index would reject it anyway; short-circuit
  -- so we don't burn a constraint violation on the hot path.
  if exists (select 1 from public.referral_attributions where invitee_id = p_invitee_id) then
    return jsonb_build_object('attached', false);
  end if;

  -- Disposable-email signal. Table-driven rather than a hardcoded array so the
  -- list can be updated without a migration.
  select exists (
    select 1 from public.referral_blocked_domains
     where domain = lower(coalesce(p_email_domain, ''))
  ) into v_disposable;

  if v_disposable then
    v_risk := 100;
    v_reason := 'disposable_email';
  end if;

  -- IP-SOFT (decision 3): a repeated IP for this referrer is suspicious but
  -- not disqualifying — shared Wi-Fi is legitimate. Add risk, do not block.
  if p_ip_hash is not null and exists (
    select 1 from public.referral_attributions
     where referrer_id = v_referrer.user_id
       and ip_hash = p_ip_hash
       and status in ('pending', 'qualified')
  ) then
    v_risk := v_risk + (v_cfg->>'ip_soft_risk_increment')::int;
    v_reason := coalesce(v_reason, 'ip_repeat_soft');
  end if;

  -- DEVICE-STRICT (decision 3): the same device already used for this
  -- referrer is a hard reject. Recorded for the audit trail, but never
  -- eligible to qualify.
  if p_device_hash is not null and exists (
    select 1 from public.referral_attributions
     where referrer_id = v_referrer.user_id
       and device_hash = p_device_hash
  ) then
    v_risk := 100;
    v_reason := 'device_duplicate';
  end if;

  insert into public.referral_attributions (
    referrer_id, invitee_id, ref_code, status,
    device_hash, ip_hash, email_domain, risk_score, rejection_reason
  ) values (
    v_referrer.user_id,
    p_invitee_id,
    upper(trim(p_ref_code)),
    case when v_risk >= (v_cfg->>'risk_reject_threshold')::int then 'rejected' else 'pending' end,
    p_device_hash, p_ip_hash, lower(nullif(p_email_domain, '')), least(v_risk, 100), v_reason
  );

  update public.referral_profiles
     set total_invites = total_invites + 1,
         updated_at = now()
   where user_id = v_referrer.user_id;

  -- Deliberately uniform: the caller cannot distinguish accepted-pending from
  -- silently-rejected. Both look like a successful attach.
  return jsonb_build_object('attached', true);
exception
  when unique_violation then
    return jsonb_build_object('attached', false);
end;
$$;

revoke all on function public.attach_referral(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.attach_referral(uuid, text, text, text, text) to service_role;

-- ===========================================================================
-- STEP 9b — validate_referral_code(): share-link click validation.
-- ===========================================================================
-- Replaces the legacy record_referral_click(). The click path runs BEFORE the
-- invitee has an account, so it cannot create an attribution row; it only
-- confirms the code is real so the edge layer can set a signed attribution
-- cookie. Deliberately returns a bare boolean and records nothing: writing a
-- row per click would let an unauthenticated visitor inflate a referrer's
-- stats, and would make the endpoint a free write amplifier.

create or replace function public.validate_referral_code(p_ref_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.referral_profiles
     where referral_code = upper(trim(p_ref_code))
       and referral_banned_at is null
  );
$$;

revoke all on function public.validate_referral_code(text) from public, anon, authenticated;
grant execute on function public.validate_referral_code(text) to service_role;

-- ===========================================================================
-- STEP 10 — Blocked-domain list (table-driven).
-- ===========================================================================

create table if not exists public.referral_blocked_domains (
  domain     text primary key,
  added_at   timestamptz not null default now()
);

insert into public.referral_blocked_domains (domain) values
  ('mailinator.com'), ('tempmail.com'), ('temp-mail.org'), ('guerrillamail.com'),
  ('10minutemail.com'), ('yopmail.com'), ('throwawaymail.com'), ('sharklasers.com'),
  ('dispostable.com'), ('trashmail.com'), ('getnada.com'), ('mohmal.com'),
  ('fakeinbox.com'), ('maildrop.cc'), ('mintemail.com'), ('spamgourmet.com')
on conflict (domain) do nothing;

alter table public.referral_blocked_domains enable row level security;
revoke all on public.referral_blocked_domains from anon, authenticated;

-- ===========================================================================
-- STEP 11 — qualify_referral(): PROOF-OF-WORK hook (requirement 2).
-- ===========================================================================
-- Called server-side AFTER a core action succeeds. Flips pending -> qualified,
-- re-runs abuse checks at qualification time (not just signup time), and
-- grants 21 days of Pro when the 2-node milestone is reached.
--
-- Idempotent: a second call for an already-qualified invitee is a no-op, so
-- wiring it into a per-action hook cannot double-credit.

create or replace function public.qualify_referral(
  p_invitee_id uuid,
  p_action     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attr       public.referral_attributions;
  v_referrer   public.referral_profiles;
  v_cfg        jsonb := public.referral_config();
  v_recent     integer;
  v_qualified  integer;
  v_grant_days integer := (v_cfg->>'grant_days')::int;
  v_cap        integer := (v_cfg->>'lifetime_day_cap')::int;
  v_remaining  integer;
  v_new_expiry timestamptz;
  v_grant_id   uuid;
  v_granted    boolean := false;
begin
  if p_invitee_id is null then
    return jsonb_build_object('qualified', false);
  end if;

  select * into v_attr
    from public.referral_attributions
   where invitee_id = p_invitee_id
   for update;

  -- No attribution, already settled, or previously rejected: nothing to do.
  if v_attr.id is null or v_attr.status <> 'pending' then
    return jsonb_build_object('qualified', false);
  end if;

  select * into v_referrer
    from public.referral_profiles
   where user_id = v_attr.referrer_id
   for update;

  if v_referrer.user_id is null or v_referrer.referral_banned_at is not null then
    update public.referral_attributions
       set status = 'rejected', rejection_reason = 'referrer_banned', updated_at = now()
     where id = v_attr.id;
    return jsonb_build_object('qualified', false);
  end if;

  -- Velocity limit: burst farming produces many qualifications in a short
  -- window. Legitimate organic referral does not.
  select count(*) into v_recent
    from public.referral_attributions
   where referrer_id = v_attr.referrer_id
     and status = 'qualified'
     and qualified_at > now() - interval '24 hours';

  if v_recent >= (v_cfg->>'max_qualified_per_24h')::int then
    update public.referral_attributions
       set status = 'rejected', rejection_reason = 'velocity_limit', updated_at = now()
     where id = v_attr.id;
    return jsonb_build_object('qualified', false);
  end if;

  -- Reciprocity / 2-cycle detection: A refers B and B refers A. A textbook
  -- ring signature that no per-row check catches.
  if exists (
    select 1 from public.referral_attributions
     where referrer_id = v_attr.invitee_id
       and invitee_id  = v_attr.referrer_id
  ) then
    update public.referral_attributions
       set status = 'rejected', rejection_reason = 'reciprocal_ring', updated_at = now()
     where id = v_attr.id;
    return jsonb_build_object('qualified', false);
  end if;

  -- Promote to qualified. The device-strict partial unique index is evaluated
  -- HERE, at the moment status becomes 'qualified' — so a duplicate device
  -- raises unique_violation and is caught below.
  begin
    update public.referral_attributions
       set status = 'qualified',
           qualified_at = now(),
           qualifying_action = p_action,
           updated_at = now()
     where id = v_attr.id;
  exception
    when unique_violation then
      update public.referral_attributions
         set status = 'rejected', rejection_reason = 'device_duplicate', updated_at = now()
       where id = v_attr.id;
      return jsonb_build_object('qualified', false);
  end;

  select count(*) into v_qualified
    from public.referral_attributions
   where referrer_id = v_attr.referrer_id
     and status = 'qualified';

  update public.referral_profiles
     set qualified_referrals = v_qualified,
         updated_at = now()
   where user_id = v_attr.referrer_id;

  -- 2-NODE MILESTONE (requirement 1). Granted once per completed pair, so a
  -- referrer earns another 21 days at 2, 4, 6, ... qualified referrals.
  if v_qualified > 0
     and v_qualified % (v_cfg->>'required_qualified_referrals')::int = 0 then

    -- Lifetime cap (decision 4): clamp, never exceed 180 days total.
    v_remaining := greatest(v_cap - v_referrer.lifetime_pro_days_granted, 0);
    v_grant_days := least(v_grant_days, v_remaining);

    if v_grant_days > 0 then
      -- EXTEND rather than overwrite: a user who already has Pro should not
      -- lose remaining time. greatest(now(), expiry) also guarantees a lapsed
      -- expiry restarts from now rather than compounding from the past.
      v_new_expiry := greatest(now(), coalesce(v_referrer.pro_tier_expires_at, now()))
                      + make_interval(days => v_grant_days);

      update public.referral_profiles
         set pro_tier_expires_at       = v_new_expiry,
             pro_unlocked_at           = coalesce(pro_unlocked_at, now()),
             pro_unlock_source         = 'referral_2node',
             lifetime_pro_days_granted = lifetime_pro_days_granted + v_grant_days,
             updated_at                = now()
       where user_id = v_attr.referrer_id;

      insert into public.referral_pro_grants (
        user_id, granted_days, expires_at, reason, triggering_attribution_id
      ) values (
        v_attr.referrer_id, v_grant_days, v_new_expiry, 'referral_2node', v_attr.id
      )
      returning id into v_grant_id;

      v_granted := true;
    end if;
  end if;

  return jsonb_build_object(
    'qualified', true,
    'qualified_referrals', v_qualified,
    'pro_granted', v_granted,
    'grant_id', v_grant_id
  );
end;
$$;

revoke all on function public.qualify_referral(uuid, text) from public, anon, authenticated;
grant execute on function public.qualify_referral(uuid, text) to service_role;

-- ===========================================================================
-- STEP 12 — Wire proof-of-work into the Ghost ledger choke point.
-- ===========================================================================
-- Every metered Ghost action already funnels through consume_ghost_action.
-- Hooking qualification there means proof-of-work is enforced in ONE place
-- rather than being re-implemented per route (the exact drift that produced
-- the MP7 auth bypass).
--
-- Rather than rewrite that function wholesale, expose a helper the API layer
-- calls immediately after a successful consume. qualify_referral is
-- idempotent, so repeat calls are safe.

create or replace function public.register_core_action(
  p_user_id uuid,
  p_action  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qualifying constant text[] := array['interrogate', 'squad', 'recon', 'clone_crush_run'];
begin
  if p_user_id is null or p_action is null then
    return jsonb_build_object('qualified', false);
  end if;
  if not (p_action = any(v_qualifying)) then
    return jsonb_build_object('qualified', false);
  end if;
  return public.qualify_referral(p_user_id, p_action);
end;
$$;

revoke all on function public.register_core_action(uuid, text) from public, anon, authenticated;
grant execute on function public.register_core_action(uuid, text) to service_role;

-- ===========================================================================
-- STEP 13 — Read APIs.
-- ===========================================================================

create or replace function public.get_pro_entitlement(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'active',     public.is_pro(p_user_id),
    'expires_at', rp.pro_tier_expires_at,
    'source',     rp.pro_unlock_source
  ) into result
  from public.referral_profiles rp
  where rp.user_id = p_user_id;

  return coalesce(
    result,
    jsonb_build_object('active', false, 'expires_at', null, 'source', null)
  );
end;
$$;

revoke all on function public.get_pro_entitlement(uuid) from public, anon;
grant execute on function public.get_pro_entitlement(uuid) to authenticated, service_role;

-- Progress only. Never exposes risk_score or rejection_reason.
create or replace function public.get_referral_dashboard(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.referral_profiles;
  v_cfg     jsonb := public.referral_config();
  v_pending integer;
begin
  select * into v_profile from public.referral_profiles where user_id = p_user_id;

  if v_profile.user_id is null then
    return jsonb_build_object('exists', false);
  end if;

  select count(*) into v_pending
    from public.referral_attributions
   where referrer_id = p_user_id and status = 'pending';

  return jsonb_build_object(
    'exists',              true,
    'referral_code',       v_profile.referral_code,
    'total_invites',       v_profile.total_invites,
    'qualified_referrals', v_profile.qualified_referrals,
    'pending_referrals',   v_pending,
    'required_for_reward', (v_cfg->>'required_qualified_referrals')::int,
    'reward_days',         (v_cfg->>'grant_days')::int,
    'pro_active',          public.is_pro(p_user_id),
    'pro_expires_at',      v_profile.pro_tier_expires_at,
    'lifetime_days_granted', v_profile.lifetime_pro_days_granted,
    'lifetime_day_cap',    (v_cfg->>'lifetime_day_cap')::int
  );
end;
$$;

revoke all on function public.get_referral_dashboard(uuid) from public, anon;
grant execute on function public.get_referral_dashboard(uuid) to authenticated, service_role;

-- ===========================================================================
-- STEP 14 — Expiry sweep + admin controls.
-- ===========================================================================
-- Expiry is self-enforcing: is_pro() compares against now() on every read, so
-- access ends the instant the timestamp passes even if this sweep never runs.
-- The sweep exists to keep stored state tidy and to make lapses observable.

create or replace function public.expire_pro_grants()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  with lapsed as (
    update public.referral_profiles
       set pro_unlock_source = null,
           updated_at = now()
     where pro_tier_expires_at is not null
       and pro_tier_expires_at <= now()
       and pro_unlock_source is not null
    returning user_id
  )
  select count(*) into v_count from lapsed;

  return v_count;
end;
$$;

revoke all on function public.expire_pro_grants() from public, anon, authenticated;
grant execute on function public.expire_pro_grants() to service_role;

create or replace function public.admin_revoke_referral(
  p_attribution_id uuid,
  p_reason         text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attr public.referral_attributions;
begin
  select * into v_attr from public.referral_attributions where id = p_attribution_id for update;
  if v_attr.id is null then
    return jsonb_build_object('revoked', false);
  end if;

  update public.referral_attributions
     set status = 'rejected', rejection_reason = coalesce(p_reason, 'admin_revoke'), updated_at = now()
   where id = p_attribution_id;

  update public.referral_pro_grants
     set revoked_at = now(), revoke_reason = coalesce(p_reason, 'admin_revoke')
   where triggering_attribution_id = p_attribution_id and revoked_at is null;

  update public.referral_profiles
     set qualified_referrals = (
           select count(*) from public.referral_attributions
            where referrer_id = v_attr.referrer_id and status = 'qualified'
         ),
         updated_at = now()
   where user_id = v_attr.referrer_id;

  return jsonb_build_object('revoked', true);
end;
$$;

revoke all on function public.admin_revoke_referral(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_revoke_referral(uuid, text) to service_role;

create or replace function public.admin_grant_seed_pro(p_user_id uuid, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expiry timestamptz;
begin
  perform public.get_or_create_referral_profile(p_user_id);

  v_expiry := greatest(now(), coalesce(
    (select pro_tier_expires_at from public.referral_profiles where user_id = p_user_id),
    now()
  )) + make_interval(days => greatest(p_days, 1));

  update public.referral_profiles
     set pro_tier_expires_at = v_expiry,
         pro_unlocked_at     = coalesce(pro_unlocked_at, now()),
         pro_unlock_source   = 'admin_seed',
         updated_at          = now()
   where user_id = p_user_id;

  insert into public.referral_pro_grants (user_id, granted_days, expires_at, reason)
  values (p_user_id, greatest(p_days, 1), v_expiry, 'admin_seed');

  return jsonb_build_object('granted', true, 'expires_at', v_expiry);
end;
$$;

revoke all on function public.admin_grant_seed_pro(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_grant_seed_pro(uuid, integer) to service_role;

-- ===========================================================================
-- STEP 15 — Row-level security.
-- ===========================================================================
-- Requirement 4: all state is keyed on user_id and resolved server-side, so
-- progress and Pro status are identical across devices and sessions. Nothing
-- is trusted from the client.

alter table public.referral_profiles     enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_pro_grants   enable row level security;

drop policy if exists referral_profiles_self_select on public.referral_profiles;
create policy referral_profiles_self_select
  on public.referral_profiles for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.referral_profiles from anon, authenticated;
grant select on public.referral_profiles to authenticated;

-- Attribution rows and grant ledger carry abuse signals and are server-only.
revoke all on public.referral_attributions from anon, authenticated;
revoke all on public.referral_pro_grants   from anon, authenticated;

-- ===========================================================================
-- STEP 16 — Hourly expiry sweep (best-effort; is_pro() is authoritative).
-- ===========================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('expire-pro-grants')
      where exists (select 1 from cron.job where jobname = 'expire-pro-grants');
    perform cron.schedule('expire-pro-grants', '0 * * * *', 'select public.expire_pro_grants();');
  end if;
exception
  when others then
    raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end;
$$;


-- ###########################################################################
-- PART 2 — Dawn Patrol cron dispatch fix (MP6 defect)
--
-- The original block nested a $$-quoted cron command inside a $$-quoted DO
-- body. PostgreSQL ends the outer body at the first inner $$, so it raised a
-- PARSE-time syntax error. A parse error cannot be trapped by the EXCEPTION
-- handler (that only catches runtime errors), so the whole block failed and
-- the hourly dispatch job was never scheduled — silently.
--
-- Requires the pg_cron and pg_net extensions. If they are not enabled this
-- block is skipped harmlessly and the client-side lazy dispatch still runs.
-- ###########################################################################

-- MP7 follow-up fix: the original block nested a $$-quoted cron command
-- inside a $$-quoted DO body. PostgreSQL terminates the outer body at the
-- first inner $$, so this raised a hard syntax error at parse time. A parse
-- error cannot be caught by the EXCEPTION handler below (that only traps
-- runtime errors), so the entire DO block failed and the dispatch job was
-- NEVER scheduled — silently, because the migration otherwise succeeded.
-- Distinct dollar-quote tags ($do$ / $cron$) keep the nesting unambiguous.
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then

    -- Idempotent schedule: drop any previous definition first so re-running
    -- the migration cannot leave a stale duplicate job behind.
    perform cron.unschedule('ghost-dawn-patrol-dispatch')
      where exists (select 1 from cron.job where jobname = 'ghost-dawn-patrol-dispatch');

    -- Hourly at :03 UTC.
    perform cron.schedule(
      'ghost-dawn-patrol-dispatch',
      '3 * * * *',
      $cron$
        select net.http_post(
          url := current_setting('app.dawn_patrol_webhook_url', true),
          headers := jsonb_build_object(
            'content-type', 'application/json',
            'authorization', 'Bearer ' || coalesce(current_setting('app.dawn_patrol_cron_secret', true), '')
          ),
          body := jsonb_build_object(
            'utc_hour', extract(hour from now() at time zone 'utc')::int
          )
        )
        where coalesce(current_setting('app.dawn_patrol_webhook_url', true), '') <> '';
      $cron$
    );
  end if;
exception when others then
  -- pg_cron/pg_net unavailable — lazy client dispatch handles it.
  raise notice 'dawn patrol cron scheduling skipped: %', sqlerrm;
end;
$do$;
