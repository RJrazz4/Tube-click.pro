-- Make the referral dashboard callable by an authenticated user without exposing
-- referral events or any other user's profile. This migration is intentionally
-- idempotent so it also repairs projects where the initial referral schema was
-- installed manually rather than through the full migration history.

alter table public.referral_profiles
  add column if not exists friends_unlocked_pro integer not null default 0
    check (friends_unlocked_pro >= 0),
  add column if not exists pro_unlocked_at timestamptz,
  add column if not exists pro_unlock_source varchar(20)
    check (pro_unlock_source in ('qualified_loop', 'admin_seed'));

alter table public.referral_profiles enable row level security;
alter table public.referral_events enable row level security;

-- Keep direct table access constrained to the aggregate row that belongs to the
-- current user. Referral events remain server-only because they contain
-- anti-fraud metadata and other users' identifiers.
drop policy if exists "Users can view their own referral profile" on public.referral_profiles;
create policy "Users can view their own referral profile"
  on public.referral_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select on public.referral_profiles to authenticated;
revoke all on public.referral_events from anon, authenticated;

-- SECURITY DEFINER is needed only to create the caller's initial profile row.
-- The auth.uid() guard is mandatory: an authenticated JWT can request only its
-- own dashboard. Service-role calls from /api/referrals continue to work for
-- server-side attribution flows, where auth.uid() is null.
create or replace function public.get_referral_dashboard(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  result jsonb;
begin
  if caller_id is not null and caller_id <> p_user_id then
    raise exception 'Referral dashboard access denied' using errcode = '42501';
  end if;

  insert into public.referral_profiles (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  -- evaluate_qualified_referral_chain is supplied by the qualified-referral
  -- migration. Guard this call so a manually installed base schema can still
  -- return a user's existing progress while that migration is being deployed.
  if to_regprocedure('public.evaluate_qualified_referral_chain(uuid,integer)') is not null then
    perform public.evaluate_qualified_referral_chain(p_user_id, 0);
  end if;

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

revoke all on function public.get_referral_dashboard(uuid) from public, anon;
grant execute on function public.get_referral_dashboard(uuid) to authenticated, service_role;
