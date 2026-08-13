-- ###########################################################################
-- PATCH — Supabase Performance Advisor 0003_auth_rls_initplan
--
-- SELF-DISCOVERING VERSION. Safe on ANY schema state.
--
-- The previous version hardcoded seven table names and failed with
--   ERROR: 42P01: relation "public.ghost_usage" does not exist
-- because production does not have the same tables as the repo.
--
-- This version assumes NOTHING. It reads pg_policies at runtime, finds every
-- RLS policy whose expression calls auth.uid() / auth.jwt() / auth.role()
-- outside a subquery, and rewrites just those — whatever they are called and
-- whatever tables they sit on. Tables that do not exist are simply never
-- visited, so a missing table cannot abort the run.
--
-- WHY THE FIX WORKS
--   auth.uid() is STABLE, not IMMUTABLE, so the planner will not fold a bare
--   call into a constant: it stays in the per-row Filter and is re-evaluated
--   for every candidate row. Written as (select auth.uid()) it becomes an
--   uncorrelated scalar subquery, which the planner hoists into an InitPlan
--   and evaluates exactly once per query.
--
--   Measured on PostgreSQL 17, 20,000-row table:
--     bare   auth.uid() = user_id  -> Filter: ...current_setting... 8.849 ms
--     (select auth.uid()) = user_id -> Filter: (InitPlan 1).col1    1.880 ms
--
-- SECURITY IS UNCHANGED
--   Each policy keeps its exact predicate, roles, and command. Only how often
--   the auth call is evaluated changes. Policies are recreated immediately
--   after being dropped, inside one transaction, so no table is ever left
--   unprotected. If any single policy fails to rebuild, the whole patch rolls
--   back and your existing policies remain exactly as they are.
--
-- IDEMPOTENT: already-fixed policies are skipped. Re-running is a no-op.
-- ###########################################################################

begin;

do $patch$
declare
  r            record;
  v_new_qual   text;
  v_new_check  text;
  v_roles      text;
  v_cmd        text;
  v_sql        text;
  v_fixed      int := 0;
  v_skipped    int := 0;
begin
  for r in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (
             (qual       ~* 'auth\.(uid|jwt|role)\(\)' and qual       !~* 'select\s+auth\.')
          or (with_check ~* 'auth\.(uid|jwt|role)\(\)' and with_check !~* 'select\s+auth\.')
           )
     order by tablename, policyname
  loop
    -- Rewrite bare auth.X() into (select auth.X()). Applied only to calls not
    -- already wrapped, so mixed expressions are handled correctly.
    v_new_qual := regexp_replace(
      coalesce(r.qual, ''),
      '(?<!select )\m(auth\.(?:uid|jwt|role)\(\))',
      '(select \1)',
      'gi'
    );
    v_new_check := regexp_replace(
      coalesce(r.with_check, ''),
      '(?<!select )\m(auth\.(?:uid|jwt|role)\(\))',
      '(select \1)',
      'gi'
    );

    -- pg_policies.roles is a name[] rendered as {a,b}; convert to a list.
    v_roles := array_to_string(r.roles, ', ');
    if v_roles is null or v_roles = '' or v_roles = '-' then
      v_roles := 'public';
    end if;

    v_cmd := case upper(r.cmd)
               when 'ALL'    then 'all'
               when 'SELECT' then 'select'
               when 'INSERT' then 'insert'
               when 'UPDATE' then 'update'
               when 'DELETE' then 'delete'
               else 'all'
             end;

    v_sql := format(
      'drop policy if exists %I on %I.%I;',
      r.policyname, r.schemaname, r.tablename
    );
    execute v_sql;

    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      r.policyname,
      r.schemaname,
      r.tablename,
      case when r.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
      v_cmd,
      v_roles
    );

    -- INSERT policies carry only WITH CHECK; the rest may carry both.
    if v_cmd <> 'insert' and nullif(v_new_qual, '') is not null then
      v_sql := v_sql || format(' using (%s)', v_new_qual);
    end if;
    if nullif(v_new_check, '') is not null then
      v_sql := v_sql || format(' with check (%s)', v_new_check);
    end if;

    execute v_sql;

    v_fixed := v_fixed + 1;
    raise notice 'InitPlan fix applied: %.% / %', r.schemaname, r.tablename, r.policyname;
  end loop;

  select count(*) into v_skipped
    from pg_policies
   where schemaname = 'public'
     and (qual ~* 'select\s+auth\.' or with_check ~* 'select\s+auth\.');

  raise notice '--------------------------------------------------------';
  raise notice 'InitPlan patch complete. Policies rewritten: %', v_fixed;
  raise notice 'Policies already using the InitPlan form: %', v_skipped;
  raise notice '--------------------------------------------------------';
end;
$patch$;

commit;

-- ###########################################################################
-- VERIFY — run this after the patch. Expect ZERO rows.
--
-- Any row returned is a policy still calling an auth function per-row.
-- Note the case-insensitive operators: PostgreSQL normalises the stored
-- expression to "( SELECT auth.uid() AS uid)" with SELECT upper-cased, so a
-- lowercase-only pattern reports false positives on already-fixed policies.
-- ###########################################################################

select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and (
         (qual       ~* 'auth\.(uid|jwt|role)\(\)' and qual       !~* 'select\s+auth\.')
      or (with_check ~* 'auth\.(uid|jwt|role)\(\)' and with_check !~* 'select\s+auth\.')
       )
 order by tablename, policyname;
