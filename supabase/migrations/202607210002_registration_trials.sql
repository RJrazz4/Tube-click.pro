-- PLG registration reward: one immutable seven-day Pro trial per authenticated user.
create table if not exists public.registration_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starts_at timestamptz default now() not null,
  expires_at timestamptz default (now() + interval '7 days') not null,
  created_at timestamptz default now() not null,
  check (expires_at = starts_at + interval '7 days')
);

alter table public.registration_trials enable row level security;

drop policy if exists "Users can view their own registration trial" on public.registration_trials;
create policy "Users can view their own registration trial"
  on public.registration_trials for select to authenticated
  using (auth.uid() = user_id);

revoke all on public.registration_trials from anon, authenticated;
grant select on public.registration_trials to authenticated;

create or replace function public.get_or_create_registration_trial(p_user_id uuid)
returns public.registration_trials
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.registration_trials;
begin
  insert into public.registration_trials (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into result
  from public.registration_trials
  where user_id = p_user_id;
  return result;
end;
$$;

revoke all on function public.get_or_create_registration_trial(uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_registration_trial(uuid) to service_role;
