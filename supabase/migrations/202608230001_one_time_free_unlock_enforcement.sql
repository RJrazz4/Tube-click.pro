-- ===========================================================================
-- ONE-TIME FREE-UNLOCK ENFORCEMENT (anti-exploit backstop)
-- ===========================================================================
-- Product rule: the "Free Unlock via Ghost Uplink" referral path is available
-- ONLY to new users and is ONE-TIME ONLY. The ProUpgradeModal already enforces
-- this client-side (new-account window + a per-user "used" flag), but the
-- client can be bypassed, so this migration makes the rule authoritative at
-- the database layer.
--
-- What this migration does:
--   1. Adds a one-time ledger column to referral_profiles.
--   2. Adds consume_one_time_free_unlock(p_user_id) — an atomic, idempotent
--      SECURITY DEFINER function that flips the slot exactly once (and only
--      while the account is still within the new-user window). Returns
--      {allowed, already_used, reason} so callers can reject repeats with a
--      clean 409-style signal.
--   3. Wires that function into attach_referral() — the in-repo "join via
--      referral link / Ghost Uplink" path — so an account can only ever
--      consume the free-unlock referral action a single time.
--   4. Surfaces free_unlock_used in get_referral_dashboard() so the client can
--      cross-check server state instead of trusting localStorage alone.
--
-- Safe to re-run: every statement is idempotent (ADD COLUMN IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, additive policy/return fields).
-- ===========================================================================

-- STEP 1 — One-time ledger column on referral_profiles.
-- 0 = never consumed, 1 = consumed. Capped at 1 by the CHECK so a bug or a
-- second call can never push it past one.
alter table if exists public.referral_profiles
  add column if not exists free_unlocks_consumed integer not null default 0
    check (free_unlocks_consumed between 0 and 1);

alter table if exists public.referral_profiles
  add column if not exists free_unlock_consumed_at timestamptz;

comment on column public.referral_profiles.free_unlocks_consumed is
  'One-time ledger for the free "Ghost Uplink" referral unlock. 0 = available, 1 = consumed. Enforced atomically by consume_one_time_free_unlock().';
comment on column public.referral_profiles.free_unlock_consumed_at is
  'Timestamp the one-time free referral unlock was consumed (audit only).';

-- STEP 2 — Atomic, idempotent consume function.
-- Returns:
--   {allowed: true,  already_used: false}  -> first (and only) consumption
--   {allowed: false, already_used: true,  reason: 'already_used'}  -> reused
--   {allowed: false, reason: 'account_too_old'}  -> outside new-user window
--   {allowed: false, reason: 'no_user'}          -> missing identity
-- The UPDATE ... WHERE free_unlocks_consumed = 0 guarantees a single flip
-- even under concurrent calls (race-safe; only one UPDATE affects a row).
create or replace function public.consume_one_time_free_unlock(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated       integer := 0;
  v_max_age_days  integer := 30;          -- new-user window (tunable)
  v_created_at    timestamptz;
begin
  if p_user_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_user');
  end if;

  -- New-user restriction: only accounts younger than the configured window
  -- may consume the free unlock. auth.users.created_at is the signup time.
  select u.created_at into v_created_at
    from auth.users u
   where u.id = p_user_id;

  if v_created_at is null then
    return jsonb_build_object('allowed', false, 'reason', 'no_user');
  end if;

  if v_created_at < now() - make_interval(days => v_max_age_days) then
    return jsonb_build_object('allowed', false, 'reason', 'account_too_old');
  end if;

  -- Ensure a profile row exists before we flip the ledger.
  perform public.get_or_create_referral_profile(p_user_id);

  update public.referral_profiles
     set free_unlocks_consumed      = 1,
         free_unlock_consumed_at    = coalesce(free_unlock_consumed_at, now()),
         updated_at                 = now()
   where user_id = p_user_id
     and free_unlocks_consumed = 0;

  get diagnostics v_updated = row_count;

  if v_updated = 1 then
    return jsonb_build_object('allowed', true, 'already_used', false);
  else
    return jsonb_build_object('allowed', false, 'already_used', true, 'reason', 'already_used');
  end if;
end;
$$;

revoke all on function public.consume_one_time_free_unlock(uuid) from public, anon, authenticated;
grant execute on function public.consume_one_time_free_unlock(uuid) to service_role;

-- STEP 3 — Enforce one-time free unlock inside attach_referral().
-- attach_referral() is the in-repo path that records a user joining via a
-- referral link / Ghost Uplink. We consume the invitee's one-time slot right
-- after the code is validated (valid, not self, not banned, not already
-- attributed) and before any attribution row is written. A denied consume
-- short-circuits with attached:false so the repeat attempt gains nothing.
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
  v_consume    jsonb;
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

  -- ONE-TIME FREE UNLOCK ENFORCEMENT (anti-exploit backstop).
  -- The invitee may consume the free referral unlock at most once, and only
  -- while still inside the new-user window. This is the server-side twin of
  -- the client guard in ProUpgradeModal.
  v_consume := public.consume_one_time_free_unlock(p_invitee_id);
  if (v_consume->>'allowed')::boolean is not true then
    return jsonb_build_object(
      'attached', false,
      'reason', coalesce(v_consume->>'reason', 'free_unlock_denied')
    );
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

-- STEP 4 — Surface free_unlock_used in the dashboard read API so the client
-- can verify server state (defence-in-depth alongside the localStorage flag).
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
    'free_unlock_used',    (v_profile.free_unlocks_consumed > 0),
    'lifetime_days_granted', v_profile.lifetime_pro_days_granted,
    'lifetime_day_cap',    (v_cfg->>'lifetime_day_cap')::int
  );
end;
$$;

revoke all on function public.get_referral_dashboard(uuid) from public, anon;
grant execute on function public.get_referral_dashboard(uuid) to authenticated, service_role;

-- STEP 5 — Operator note (documentation only; no execution).
-- The external referral-apply bot (VITE_REFERRAL_API_URL/api/referral/apply,
-- not in this repo) should call consume_one_time_free_unlock(<applying_user_id>)
-- before granting/crediting, so enforcement is consistent across BOTH the
-- in-repo attach path and the apply-code path. On {allowed:false} it must
-- return HTTP 409 "already applied" exactly as today.
