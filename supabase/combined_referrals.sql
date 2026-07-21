create extension if not exists pgcrypto;
create table if not exists public.referral_profiles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id) on delete cascade,
 referral_code varchar(12) not null unique default ('TC_'||upper(substr(encode(gen_random_bytes(6),'hex'),1,8))),
 total_invites int not null default 0 check(total_invites>=0), verified_referrals int not null default 0 check(verified_referrals>=0),
 friends_unlocked_pro int not null default 0 check(friends_unlocked_pro>=0), pro_tier_expires_at timestamptz,
 pro_unlocked_at timestamptz, pro_unlock_source varchar(20) check(pro_unlock_source in ('qualified_loop','admin_seed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.referral_events (
 id uuid primary key default gen_random_uuid(), referrer_id uuid references auth.users(id) on delete set null,
 ref_code varchar(12) not null, referred_user_id uuid references auth.users(id) on delete cascade,
 ip_hash varchar(64) not null, event_type varchar(20) not null default 'signup' check(event_type in('click','signup')),
 status varchar(20) not null default 'pending' check(status in('pending','verified','flagged')),
 created_at timestamptz not null default now(), verified_at timestamptz
);
create unique index if not exists referral_one_user on public.referral_events(referred_user_id) where referred_user_id is not null;
create unique index if not exists referral_one_ip on public.referral_events(referrer_id,ip_hash) where event_type='signup' and status='verified';
create index if not exists referral_referrer_idx on public.referral_events(referrer_id,created_at desc);
alter table public.referral_profiles enable row level security; alter table public.referral_events enable row level security;
drop policy if exists referral_profile_select on public.referral_profiles;
create policy referral_profile_select on public.referral_profiles for select to authenticated using(auth.uid()=user_id);
revoke all on public.referral_profiles,public.referral_events from anon,authenticated;
grant select on public.referral_profiles to authenticated;

create or replace function public.evaluate_qualified_referral_chain(p_user_id uuid,p_depth int default 0) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare invites int; unlocked int; parent uuid; begin
 if p_user_id is null or p_depth>20 then return; end if;
 select count(*) filter(where event_type='signup' and status='verified' and referred_user_id is not null),count(*) filter(where event_type='signup' and status='verified' and referred_user_id is not null and exists(select 1 from referral_profiles p where p.user_id=e.referred_user_id and p.pro_unlocked_at is not null)) into invites,unlocked from referral_events e where referrer_id=p_user_id;
 insert into referral_profiles(user_id,verified_referrals,friends_unlocked_pro) values(p_user_id,invites,unlocked) on conflict(user_id) do update set verified_referrals=excluded.verified_referrals,friends_unlocked_pro=excluded.friends_unlocked_pro,updated_at=now();
 if invites>=3 and unlocked>=1 and not exists(select 1 from referral_profiles where user_id=p_user_id and pro_unlocked_at is not null) then
  update referral_profiles set pro_unlocked_at=now(),pro_tier_expires_at=now()+interval '7 days',pro_unlock_source='qualified_loop',updated_at=now() where user_id=p_user_id;
  select referrer_id into parent from referral_events where referred_user_id=p_user_id and status='verified' order by verified_at desc nulls last,created_at desc limit 1;
  perform public.evaluate_qualified_referral_chain(parent,p_depth+1);
 end if;
end $$;

create or replace function public.claim_referral_reward(p_ref_code text,p_referred_user_id uuid,p_ip_hash text,p_email_domain text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid; r referral_profiles; bad text[]:=array['mailinator.com','tempmail.com','temp-mail.org','guerrillamail.com','10minutemail.com','yopmail.com']; begin
 select user_id into owner from referral_profiles where referral_code=upper(p_ref_code) for update;
 if owner is null then return jsonb_build_object('verified',false,'reason','invalid_code'); end if;
 if owner=p_referred_user_id then return jsonb_build_object('verified',false,'reason','self_referral'); end if;
 if lower(coalesce(p_email_domain,''))=any(bad) then return jsonb_build_object('verified',false,'reason','disposable_email'); end if;
 if exists(select 1 from referral_events where referred_user_id=p_referred_user_id) or exists(select 1 from referral_events where referrer_id=owner and ip_hash=p_ip_hash and event_type='signup' and status='verified') then return jsonb_build_object('verified',false,'reason','duplicate_attribution'); end if;
 insert into referral_events(referrer_id,ref_code,referred_user_id,ip_hash,event_type,status,verified_at) values(owner,upper(p_ref_code),p_referred_user_id,p_ip_hash,'signup','verified',now());
 update referral_profiles set total_invites=total_invites+1,updated_at=now() where user_id=owner; perform evaluate_qualified_referral_chain(owner);
 select * into r from referral_profiles where user_id=owner; return jsonb_build_object('verified',true,'qualified',r.pro_unlocked_at is not null,'verified_referrals',r.verified_referrals,'friends_unlocked_pro',r.friends_unlocked_pro,'pro_tier_expires_at',r.pro_tier_expires_at);
exception when unique_violation then return jsonb_build_object('verified',false,'reason','duplicate_attribution'); end $$;
create or replace function public.get_referral_dashboard(p_user_id uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select to_jsonb(p) from referral_profiles p where user_id=p_user_id $$;
revoke all on function public.claim_referral_reward(text,uuid,text,text),public.get_referral_dashboard(uuid),public.evaluate_qualified_referral_chain(uuid,int) from public,anon,authenticated;
grant execute on function public.claim_referral_reward(text,uuid,text,text),public.get_referral_dashboard(uuid) to service_role;

-- Keep referral rows available for every newly-created auth user.
create or replace function public.create_referral_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.referral_profiles(user_id)
  values(new.id)
  on conflict(user_id) do nothing;
  return new;
end
$$;

revoke all on function public.create_referral_profile_for_user()
from public,anon,authenticated;

drop trigger if exists create_referral_profile_after_signup
on auth.users;

create trigger create_referral_profile_after_signup
after insert on auth.users
for each row
execute function public.create_referral_profile_for_user();

insert into public.referral_profiles(user_id)
select id from auth.users
on conflict(user_id) do nothing;

-- Click attribution is deliberately service-role only; ip_hash must be generated
-- server-side with REFERRAL_HASH_SECRET and never exposed to the browser.
create or replace function public.record_referral_click(
  p_ref_code text,
  p_ip_hash text
)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  owner uuid;
begin
  select user_id into owner
  from public.referral_profiles
  where referral_code=upper(p_ref_code);

  if owner is null then
    return false;
  end if;

  if exists(
    select 1 from public.referral_events
    where referrer_id=owner
      and ip_hash=p_ip_hash
      and event_type='click'
      and created_at > now()-interval '24 hours'
  ) then
    return true;
  end if;

  insert into public.referral_events(
    referrer_id,ref_code,ip_hash,event_type,status
  ) values (
    owner,upper(p_ref_code),p_ip_hash,'click','pending'
  );

  update public.referral_profiles
  set total_invites=total_invites+1,updated_at=now()
  where user_id=owner;

  return true;
end
$$;

revoke all on function public.record_referral_click(text,text)
from public,anon,authenticated;

grant execute on function public.record_referral_click(text,text)
to service_role;
