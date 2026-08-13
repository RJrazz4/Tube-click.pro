-- ###########################################################################
-- PATCH — Supabase Performance Advisor 0003_auth_rls_initplan
--
-- Wraps auth.uid() in a scalar subquery in every RLS policy so PostgreSQL
-- hoists it into an InitPlan and evaluates it ONCE per query instead of once
-- per row.
--
-- WHY THIS WORKS
--   auth.uid() is STABLE, not IMMUTABLE, so the planner will not fold a bare
--   call into a constant — it stays in the per-row Filter and is re-evaluated
--   for every candidate row. Written as (select auth.uid()), it becomes an
--   uncorrelated scalar subquery, which the planner hoists into an InitPlan
--   and evaluates a single time.
--
--   Measured on PostgreSQL 17 with a 20,000-row table:
--     bare  auth.uid() = user_id   -> Filter: ...current_setting...   8.849 ms
--     (select auth.uid()) = user_id -> Filter: (InitPlan 1).col1      1.880 ms
--   ~4.7x faster, and the gap widens as the table grows.
--
-- SCOPE
--   The advisor flagged referral_profiles, but the same pattern exists on 7
--   policies across 7 tables — every per-user table shipped in the Ghost arc.
--   All are patched here; fixing only the flagged one would leave the same
--   defect on the tables that will grow fastest (ghost_memory_chunks and
--   ghost_recon_frames hold one row per transcript chunk / video frame).
--
-- SAFETY
--   Security semantics are IDENTICAL. Each policy still compares the caller's
--   auth.uid() to user_id; only evaluation frequency changes. Each policy is
--   dropped and recreated in the same statement batch, inside one implicit
--   transaction, so there is no window where a table sits unprotected.
--
--   Idempotent: safe to run more than once.
--
--   NOTE ON RLS FOR ALL: a policy created with `for all` applies its USING
--   clause to reads/deletes and its WITH CHECK clause to writes. Both are
--   preserved below. These tables are written exclusively through
--   SECURITY DEFINER functions, so the WITH CHECK clause is defence in depth.
-- ###########################################################################

-- ---------------------------------------------------------------------------
-- 1. referral_profiles — the policy the advisor flagged.
-- ---------------------------------------------------------------------------
drop policy if exists referral_profiles_self_select on public.referral_profiles;
create policy referral_profiles_self_select
  on public.referral_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. ghost_usage — credit ledger reads.
-- ---------------------------------------------------------------------------
drop policy if exists ghost_usage_self_select on public.ghost_usage;
create policy ghost_usage_self_select
  on public.ghost_usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. daily_usage — Clone Crush quota reads.
-- ---------------------------------------------------------------------------
drop policy if exists daily_usage_self_select on public.daily_usage;
create policy daily_usage_self_select
  on public.daily_usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 4. ghost_memory_chunks — highest-volume table (one row per transcript
--    chunk). Benefits most from the InitPlan hoist.
-- ---------------------------------------------------------------------------
drop policy if exists ghost_memory_chunks_self_all on public.ghost_memory_chunks;
create policy ghost_memory_chunks_self_all
  on public.ghost_memory_chunks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 5. ghost_recon_frames — one row per sampled video frame.
-- ---------------------------------------------------------------------------
drop policy if exists ghost_recon_frames_self_all on public.ghost_recon_frames;
create policy ghost_recon_frames_self_all
  on public.ghost_recon_frames for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 6. ghost_squad_briefs — competitor dossiers.
-- ---------------------------------------------------------------------------
drop policy if exists ghost_squad_briefs_self_all on public.ghost_squad_briefs;
create policy ghost_squad_briefs_self_all
  on public.ghost_squad_briefs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 7. ghost_dawn_patrol_briefs — sunrise briefings.
-- ---------------------------------------------------------------------------
drop policy if exists ghost_dawn_patrol_briefs_self_all on public.ghost_dawn_patrol_briefs;
create policy ghost_dawn_patrol_briefs_self_all
  on public.ghost_dawn_patrol_briefs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ###########################################################################
-- VERIFY — expect zero rows. Any row returned is a policy still calling
-- auth.uid() outside a subquery wrapper.
-- ###########################################################################
--
-- select tablename, policyname
--   from pg_policies
--  where schemaname = 'public'
--    and (
--      (qual       ~* 'auth\.(uid|jwt|role)\(\)' and qual       !~* 'select\s+auth\.')
--      or
--      (with_check ~* 'auth\.(uid|jwt|role)\(\)' and with_check !~* 'select\s+auth\.')
--    );
--
-- Use case-INSENSITIVE operators (~* / !~*). PostgreSQL normalises a stored
-- policy expression to "( SELECT auth.uid() AS uid)" with SELECT upper-cased,
-- so a lowercase-only pattern reports false positives on already-fixed
-- policies.
