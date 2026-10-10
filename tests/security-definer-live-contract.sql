\set ON_ERROR_STOP on

\echo 'Verifying authenticated SECURITY DEFINER surface'

select (
  select count(*)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
)=48 as ok \gset
\if :ok
\else
  \echo 'FAIL: authenticated SECURITY DEFINER surface count changed and requires review'
  \quit 1
\endif

select not exists (
  select 1
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and position('search_path' in lower(coalesce(array_to_string(p.proconfig, ','),'')))=0
) as ok \gset
\if :ok
\else
  \echo 'FAIL: an authenticated SECURITY DEFINER function does not pin search_path'
  \quit 1
\endif

select not exists (
  select 1
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and p.proname <> 'get_billing_summary_v1'
    and position('auth.uid' in lower(pg_get_functiondef(p.oid)))=0
) as ok \gset
\if :ok
\else
  \echo 'FAIL: an authenticated SECURITY DEFINER function lacks an explicit auth.uid guard'
  \quit 1
\endif

select exists (
  select 1
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_billing_summary_v1'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and position('private.has_org_role' in lower(pg_get_functiondef(p.oid)))>0
) as ok \gset
\if :ok
\else
  \echo 'FAIL: billing summary must retain its delegated organisation-role guard'
  \quit 1
\endif

select not exists (
  select 1
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE')
) as ok \gset
\if :ok
\else
  \echo 'FAIL: anonymous role can execute a public SECURITY DEFINER function'
  \quit 1
\endif

\echo 'PASS: authenticated SECURITY DEFINER surface contract'
