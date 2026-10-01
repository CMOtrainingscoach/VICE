begin;
select plan(3);

-- Setup: two tenants and two users simulated via JWT claims is done in application tests.
-- This file validates helper functions exist and RLS is enabled.

select ok(
  exists (
    select 1
    from pg_tables
    where schemaname = 'app' and tablename = 'tenants' and rowsecurity = true
  ),
  'RLS enabled on app.tenants'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'has_capability'
  ),
  'has_capability function exists'
);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'bootstrap_platform_admin'
  ),
  'bootstrap_platform_admin function exists'
);

select * from finish();
rollback;
