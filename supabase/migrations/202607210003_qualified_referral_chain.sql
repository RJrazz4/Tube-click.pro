-- Replace per-signup rewards and registration trials with the strict qualified chain:
-- 3 verified friends + at least 1 of those friends has unlocked Pro.

-- The old automatic registration trial conflicts with the qualified loop.
drop function if exists public.get_or_create_registration_trial(uuid);
drop table if exists public.registration_trials;

alter table public.referral_profiles
  add column if not exists friends_unlocked_pro integer not null default 0 check (friends_unlocked_pro >= 0),
  add column if not exists pro_unlocked_at timestamptz,
  add column if not exists pro_unlock_source varchar(20) check (pro_unlock_source in ('qualified_loop', 'admin_seed'));

-- Invalidate legacy per-signup expirations. The evaluator below re-grants only
-- profiles that satisfy both new qualification conditions.
update public.referral_profiles
set pro_tier_expires_at = null,
    updated_at = now()
where pro_unlocked_at is null;

-- Internal recursive evaluator. A newly unlocked user can qualify their own referrer,
-- creating the intended chain reaction. Depth is bounded defensively.
create or replace function public.evaluate_qualified_referral_chain(p_user_id uuid, p_depth integer default 0)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite_count integer := 0;
  unlocked_friend_count integer := 0;
  profile_row public.referral_profiles;
  parent_user_id uuid;
begin
  if p_user_id is null or p_depth > 20 then return; end if;

  insert into public.referral_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select count(distinct event.referred_user_id)::integer
    into invite_count
  from public.referral_events event
  where event.referrer_id = p_user_id
    and event.event_type = 'signup'
    and event.status = 'verified'
    and event.referred_user_id is not null;

  select count(distinct event.referred_user_id)::integer
    into unlocked_friend_count
  from public.referral_events event
  join public.referral_profiles referred_profile
    on referred_profile.user_id = event.referred_user_id
  where event.referrer_id = p_user_id
    and event.event_type = 'signup'
    and event.status = 'verified'
    and referred_profile.pro_unlocked_at is not null;

  update public.referral_profiles
  set verified_referrals = invite_count,
      friends_unlocked_pro = unlocked_friend_count,
      updated_at = now()
  where user_id = p_user_id
  returning * into profile_row;

  if invite_count >= 3
     and unlocked_friend_count >= 1
     and profile_row.pro_unlocked_at is null then
    update public.referral_profiles
    set pro_unlocked_at = now(),
        pro_tier_expires_at = now() + interval '7 days',
        pro_unlock_source = 'qualified_loop',
        updated_at = now()
    where user_id = p_user_id;

    -- The user's unlock may satisfy Condition 2 for their own referrer.
    select event.referrer_id into parent_user_id
    from public.referral_events event
    where event.referred_user_id = p_user_id
      and event.event_type = 'signup'
      and event.status = 'verified'
    order by event.verified_at desc nulls last, event.created_at desc
    limit 1;

    if parent_user_id is not null then
      perform public.evaluate_qualified_referral_chain(parent_user_id, p_depth + 1);
    end if;
  end if;
end;
$$;

-- Replaces the Phase 5 per-signup reward. A verified signup only increments
-- qualification progress; it never grants Pro by itself.
create or replace function public.claim_referral_reward(
  p_ref_code text,
  p_referred_user_id uuid,
  p_ip_hash text,
  p_email_domain text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile_row public.referral_profiles;
  dashboard jsonb;
  disposable_domains constant text[] := array[
    'mailinator.com', 'tempmail.com', 'temp-mail.org', 'guerrillamail.com',
    '10minutemail.com', 'yopmail.com', 'throwawaymail.com'
  ];
begin
  select * into profile_row
  from public.referral_profiles
  where referral_code = upper(p_ref_code)
  for update;

  if profile_row.user_id is null then
    return jsonb_build_object('verified', false, 'reason', 'invalid_code');
  end if;
  if profile_row.user_id = p_referred_user_id then
    return jsonb_build_object('verified', false, 'reason', 'self_referral');
  end if;
  if lower(coalesce(p_email_domain, '')) = any(disposable_domains) then
    insert into public.referral_events (referrer_id, ref_code, referred_user_id, ip_hash, event_type, status)
    values (profile_row.user_id, upper(p_ref_code), p_referred_user_id, p_ip_hash, 'signup', 'flagged')
    on conflict do nothing;
    return jsonb_build_object('verified', false, 'reason', 'disposable_email');
  end if;
  if exists (select 1 from public.referral_events where referred_user_id = p_referred_user_id) then
    return jsonb_build_object('verified', false, 'reason', 'already_attributed');
  end if;
  if exists (
    select 1 from public.referral_events
    where referrer_id = profile_row.user_id and ip_hash = p_ip_hash
      and event_type = 'signup' and status = 'verified'
  ) then
    insert into public.referral_events (referrer_id, ref_code, referred_user_id, ip_hash, event_type, status)
    values (profile_row.user_id, upper(p_ref_code), p_referred_user_id, p_ip_hash, 'signup', 'flagged');
    return jsonb_build_object('verified', false, 'reason', 'network_duplicate');
  end if;

  insert into public.referral_events (
    referrer_id, ref_code, referred_user_id, ip_hash, event_type, status, verified_at
  ) values (
    profile_row.user_id, upper(p_ref_code), p_referred_user_id, p_ip_hash, 'signup', 'verified', now()
  );

  perform public.evaluate_qualified_referral_chain(profile_row.user_id, 0);

  select jsonb_build_object(
    'verified', true,
    'verified_referrals', refreshed.verified_referrals,
    'friends_unlocked_pro', refreshed.friends_unlocked_pro,
    'qualified', refreshed.pro_unlocked_at is not null,
    'pro_tier_expires_at', refreshed.pro_tier_expires_at
  ) into dashboard
  from public.referral_profiles refreshed
  where refreshed.user_id = profile_row.user_id;

  return dashboard;
exception
  when unique_violation then
    return jsonb_build_object('verified', false, 'reason', 'duplicate_attribution');
end;
$$;

create or replace function public.get_referral_dashboard(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  insert into public.referral_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  perform public.evaluate_qualified_referral_chain(p_user_id, 0);

  select jsonb_build_object(
    'referral_code', profile.referral_code,
    'total_invites', profile.total_invites,
    'verified_referrals', profile.verified_referrals,
    'friends_unlocked_pro', profile.friends_unlocked_pro,
    'qualified', profile.pro_unlocked_at is not null,
    'pro_unlocked_at', profile.pro_unlocked_at,
    'pro_tier_expires_at', profile.pro_tier_expires_at,
    'pro_unlock_source', profile.pro_unlock_source
  ) into result
  from public.referral_profiles profile
  where profile.user_id = p_user_id;

  return result;
end;
$$;

create or replace function public.get_pro_entitlement(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.evaluate_qualified_referral_chain(p_user_id, 0);
  select jsonb_build_object(
    'active', profile.pro_tier_expires_at is not null and profile.pro_tier_expires_at > now(),
    'expires_at', profile.pro_tier_expires_at,
    'source', profile.pro_unlock_source
  ) into result
  from public.referral_profiles profile
  where profile.user_id = p_user_id;
  return coalesce(result, jsonb_build_object('active', false, 'expires_at', null, 'source', null));
end;
$$;

-- Seed-user escape hatch. Invoke only from a trusted service-role/admin context:
-- select public.admin_grant_seed_pro('<user uuid>', 7);
create or replace function public.admin_grant_seed_pro(p_user_id uuid, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user_id uuid;
begin
  if p_days < 1 or p_days > 30 then
    raise exception 'Seed grant days must be between 1 and 30';
  end if;

  insert into public.referral_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.referral_profiles
  set pro_unlocked_at = coalesce(pro_unlocked_at, now()),
      pro_tier_expires_at = greatest(now(), coalesce(pro_tier_expires_at, now())) + make_interval(days => p_days),
      pro_unlock_source = 'admin_seed',
      updated_at = now()
  where user_id = p_user_id;

  select event.referrer_id into parent_user_id
  from public.referral_events event
  where event.referred_user_id = p_user_id
    and event.event_type = 'signup'
    and event.status = 'verified'
  order by event.verified_at desc nulls last, event.created_at desc
  limit 1;

  if parent_user_id is not null then
    perform public.evaluate_qualified_referral_chain(parent_user_id, 0);
  end if;

  return public.get_referral_dashboard(p_user_id);
end;
$$;

revoke all on function public.evaluate_qualified_referral_chain(uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_referral_reward(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_referral_dashboard(uuid) from public, anon, authenticated;
revoke all on function public.get_pro_entitlement(uuid) from public, anon, authenticated;
revoke all on function public.admin_grant_seed_pro(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_referral_reward(text, uuid, text, text) to service_role;
grant execute on function public.get_referral_dashboard(uuid) to service_role;
grant execute on function public.get_pro_entitlement(uuid) to service_role;
grant execute on function public.admin_grant_seed_pro(uuid, integer) to service_role;
