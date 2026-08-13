-- ===========================================================================
-- 202608140008 — Persist the dawn-patrol niche
-- ===========================================================================
-- 202608140007 added referral_profiles.niche because
-- ghost_dawn_patrol_due_users() selects it. But nothing ever WRITES that
-- column, so it is permanently NULL and the cron generates every scheduled
-- brief with an empty niche - the analyst prompt falls back to
-- "the creator's saved niche" and the output is generic.
--
-- The niche IS known at generate time: the client posts it and the API
-- stores it on the brief row as niche_snapshot. It was simply never written
-- back to the profile the cron reads.
--
-- This migration adds the writer, and backfills from the most recent brief
-- so existing users get a correct niche on the very next cron run instead of
-- having to open the app first.
-- ===========================================================================

-- ------------------------------------------------------------------
-- 1. Writer. Called by the interactive generate path.
-- ------------------------------------------------------------------
-- Deliberately a no-op for blank input: an empty textbox must never wipe a
-- good stored niche (the cron would silently degrade to generic briefs).
create or replace function public.ghost_dawn_patrol_set_niche(
  p_user_id uuid,
  p_niche   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_clean text := nullif(btrim(coalesce(p_niche, '')), '');
begin
  if p_user_id is null or v_clean is null then
    return jsonb_build_object('ok', false);
  end if;

  -- Bound the stored value; the column is free text and this is user input.
  v_clean := left(v_clean, 120);

  insert into public.referral_profiles (user_id, niche)
  values (p_user_id, v_clean)
  on conflict (user_id) do update
    set niche = excluded.niche;

  return jsonb_build_object('ok', true, 'niche', v_clean);
end;
$fn$;

revoke all on function public.ghost_dawn_patrol_set_niche(uuid, text) from public, anon, authenticated;
grant execute on function public.ghost_dawn_patrol_set_niche(uuid, text) to service_role;

-- ------------------------------------------------------------------
-- 2. Backfill from the latest non-empty niche_snapshot per user.
-- ------------------------------------------------------------------
update public.referral_profiles rp
   set niche = src.niche_snapshot
  from (
    select distinct on (b.user_id)
           b.user_id,
           b.niche_snapshot
      from public.ghost_dawn_patrol_briefs b
     where nullif(btrim(coalesce(b.niche_snapshot, '')), '') is not null
     order by b.user_id, b.brief_date desc
  ) src
 where rp.user_id = src.user_id
   and rp.niche is null;
