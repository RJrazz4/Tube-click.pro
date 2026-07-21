-- Phase 5: privacy-preserving PLG referral attribution and capped Pro rewards.
create extension if not exists pgcrypto;

create table if not exists public.referral_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  referral_code varchar(12) unique not null default ('TC_' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))),
  total_invites integer default 0 not null check (total_invites >= 0),
  verified_referrals integer default 0 not null check (verified_referrals >= 0),
  pro_tier_expires_at timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references auth.users(id) on delete set null,
  ref_code varchar(12) not null,
  referred_user_id uuid references auth.users(id) on delete cascade,
  ip_hash varchar(64) not null,
  event_type varchar(20) default 'signup' not null check (event_type in ('click', 'signup')),
  status varchar(20) default 'pending' not null check (status in ('pending', 'verified', 'flagged')),
  created_at timestamptz default timezone('utc'::text, now()) not null,
  verified_at timestamptz
);

create unique index if not exists referral_events_referred_user_unique
  on public.referral_events (referred_user_id)
  where referred_user_id is not null;
create index if not exists referral_events_referrer_created_idx
  on public.referral_events (referrer_id, created_at desc);
create index if not exists referral_events_expiry_idx
  on public.referral_events (created_at);
create unique index if not exists referral_events_verified_ip_unique
  on public.referral_events (referrer_id, ip_hash)
  where status = 'verified' and event_type = 'signup';

alter table public.referral_profiles enable row level security;
alter table public.referral_events enable row level security;

-- Users may see only their aggregate profile. All mutations and event access stay server-only.
drop policy if exists "Users can view their own referral profile" on public.referral_profiles;
create policy "Users can view their own referral profile"
  on public.referral_profiles for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.referral_profiles from anon, authenticated;
grant select on public.referral_profiles to authenticated;
revoke all on public.referral_events from anon, authenticated;

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

-- Backfill existing users so Phase 5 works immediately after deployment.
insert into public.referral_profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

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
  on conflict (user_id) do update set updated_at = public.referral_profiles.updated_at
  returning * into result;
  return result;
end;
$$;

create or replace function public.record_referral_click(p_ref_code text, p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id
  from public.referral_profiles
  where referral_code = upper(p_ref_code);
  if owner_id is null then return false; end if;

  -- One counted invite per privacy-preserving IP hash in a rolling 24-hour window.
  if exists (
    select 1 from public.referral_events
    where referrer_id = owner_id and ip_hash = p_ip_hash and event_type = 'click'
      and created_at > now() - interval '24 hours'
  ) then return true; end if;

  insert into public.referral_events (referrer_id, ref_code, ip_hash, event_type, status)
  values (owner_id, upper(p_ref_code), p_ip_hash, 'click', 'pending');
  update public.referral_profiles
    set total_invites = total_invites + 1, updated_at = now()
    where user_id = owner_id;
  return true;
end;
$$;

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
  new_expiry timestamptz;
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

  -- Add seven days atomically, while never allowing more than 30 active days from now.
  new_expiry := least(
    greatest(now(), coalesce(profile_row.pro_tier_expires_at, now())) + interval '7 days',
    now() + interval '30 days'
  );
  update public.referral_profiles
  set verified_referrals = verified_referrals + 1,
      pro_tier_expires_at = new_expiry,
      updated_at = now()
  where user_id = profile_row.user_id;

  return jsonb_build_object('verified', true, 'pro_tier_expires_at', new_expiry);
exception
  when unique_violation then
    return jsonb_build_object('verified', false, 'reason', 'duplicate_attribution');
end;
$$;

revoke all on function public.get_or_create_referral_profile(uuid) from public, anon, authenticated;
revoke all on function public.record_referral_click(text, text) from public, anon, authenticated;
revoke all on function public.claim_referral_reward(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.get_or_create_referral_profile(uuid) to service_role;
grant execute on function public.record_referral_click(text, text) to service_role;
grant execute on function public.claim_referral_reward(text, uuid, text, text) to service_role;

-- Keep anti-fraud metadata only as long as operationally necessary.
-- Schedule daily with pg_cron when available:
-- select cron.schedule('purge-referral-ip-hashes', '15 3 * * *',
--   $$delete from public.referral_events where created_at < now() - interval '90 days'$$);
