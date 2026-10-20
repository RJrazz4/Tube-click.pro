-- ===========================================================================
-- REFERRAL OPEN-TO-ALL — the 30-day clock runs from the REFERRAL CLICK
-- ===========================================================================
-- Owner decision 2026-10-20: referrals are OPEN TO EVERYONE. Eligibility is
-- no longer measured from the invitee's auth-account creation date; the
-- clock starts at the FIRST SITE VISIT — the referral click.
--
-- What changed and why:
--   * Previously, attach_referral() called consume_one_time_free_unlock(),
--     which denied attribution whenever auth.users.created_at was older than
--     30 days ('account_too_old') and returned BEFORE writing any row. An
--     identity created long ago that opened the product for the first time
--     months later was permanently — and silently — locked out of referral
--     attribution (see BUG_AUDIT_2026-10-19.md, "REFERRAL ATTRIBUTION
--     ROOT-CAUSE").
--   * The 30-day window is now the referral click's own lifetime: the signed
--     _tc_ref cookie that api/referrals.ts sets at click time (Max-Age 30
--     days, issuedAt verified server-side at claim) already enforces
--     click -> claim within 30 days. That cookie window REPLACES the
--     auth-account-age gate on the attribution path.
--   * This migration redefines attach_referral() with the body copied
--     byte-faithfully from its current live definition
--     (202608230001_one_time_free_unlock_enforcement.sql) with ONLY the
--     age-gate logic changed: the consume_one_time_free_unlock() call is
--     replaced by an inline one-time ledger flip with no age check.
--
-- Kept UNCHANGED (all still enforced exactly as before):
--   * Self-referral guard, banned-referrer guard, invalid-code guard,
--     already-attributed guard.
--   * Disposable-email and duplicate-device risk scoring — both still write
--     status='rejected' attribution rows at the configured threshold.
--   * One-time ledger semantics: free_unlocks_consumed flips exactly once
--     per invitee (same atomic UPDATE ... WHERE free_unlocks_consumed = 0);
--     a second attribution attempt is denied before any row is written.
--
-- Scoping note: consume_one_time_free_unlock() itself is NOT redefined here.
-- Its only in-repo caller was attach_referral(). The external referral-apply
-- bot mentioned in 202608230001 STEP 5 (dead in this deployment —
-- VITE_REFERRAL_API_URL unset) would keep its current age-gated behaviour if
-- revived; that is a separate product decision.
--
-- Safe to re-run: CREATE OR REPLACE FUNCTION only.
-- ===========================================================================

-- Redefine attach_referral() — identical to the 202608230001 definition
-- except the one-time-unlock block (marked below) no longer applies the
-- auth-account-age gate.
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
  v_consumed   integer := 0;
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

  -- ONE-TIME REFERRAL SLOT — OPEN-TO-ALL (owner decision 2026-10-20).
  -- CHANGED vs 202608230001: this block previously delegated to
  -- consume_one_time_free_unlock(), whose auth-account-age gate
  -- ('account_too_old' for accounts older than 30 days) denied attribution
  -- to invitees of any older account. That gate is REMOVED on this path:
  -- eligibility is governed by the 30-day _tc_ref cookie window enforced by
  -- api/referrals.ts (click -> claim), not by auth.users.created_at.
  -- The one-time ledger flip below is the same atomic statement the consume
  -- function used, so the slot still flips exactly once per invitee and a
  -- repeat attempt is denied here, before any attribution row is written.
  perform public.get_or_create_referral_profile(p_invitee_id);

  update public.referral_profiles
     set free_unlocks_consumed      = 1,
         free_unlock_consumed_at    = coalesce(free_unlock_consumed_at, now()),
         updated_at                 = now()
   where user_id = p_invitee_id
     and free_unlocks_consumed = 0;

  get diagnostics v_consumed = row_count;

  if v_consumed <> 1 then
    return jsonb_build_object('attached', false, 'reason', 'already_used');
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
