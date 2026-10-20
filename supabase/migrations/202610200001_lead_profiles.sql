-- Round 4 (2026-10-20): Professional-details lead capture for FREE Pro
-- activation. The frontend (src/lib/leads/leadDetails.ts) upserts into this
-- table once the owner applies this migration; until then the client write
-- fails gracefully and the record lives in the browser + lead webhook.
-- Apply via Supabase SQL editor / CLI like the other migrations here.

create table if not exists public.lead_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  phone text not null,
  email text not null,
  location text not null,
  online_income text not null,
  online_income_exact text,
  physical_income text not null,
  physical_income_exact text,
  -- Referral attribution captured at signup (referral_events.ref_code), if any.
  referrer_code text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.lead_profiles enable row level security;

drop policy if exists lead_profiles_self_select on public.lead_profiles;
create policy lead_profiles_self_select
  on public.lead_profiles for select
  using (auth.uid() = user_id);

drop policy if exists lead_profiles_self_insert on public.lead_profiles;
create policy lead_profiles_self_insert
  on public.lead_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists lead_profiles_self_update on public.lead_profiles;
create policy lead_profiles_self_update
  on public.lead_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
