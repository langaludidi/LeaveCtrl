create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists http with schema extensions;

create table if not exists private.production_health_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default clock_timestamp(),
  http_status integer,
  healthy boolean not null,
  release_commit text,
  response_ms integer,
  error_text text
);

revoke all on table private.production_health_checks
from public, anon, authenticated;

create index if not exists production_health_checks_checked_at_idx
on private.production_health_checks (checked_at desc);

create or replace function private.run_production_health_check()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_status integer;
  v_content text;
  v_json jsonb;
  v_healthy boolean := false;
  v_release text;
  v_elapsed integer;
begin
  begin
    select h.status, h.content
      into v_status, v_content
    from extensions.http_get('https://app.leavectrl.co.za/api/health') h;

    begin
      v_json := nullif(v_content, '')::jsonb;
    exception when others then
      v_json := null;
    end;

    v_release := case when v_json is null then null else v_json->>'release_commit' end;
    v_healthy := v_status = 200
      and v_json is not null
      and coalesce(v_json->>'status','') = 'ok';
    v_elapsed := round(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer;

    insert into private.production_health_checks(
      http_status, healthy, release_commit, response_ms, error_text
    ) values (
      v_status,
      v_healthy,
      v_release,
      v_elapsed,
      case when v_healthy then null else left(coalesce(v_content,'unexpected_health_response'), 500) end
    );

    if not v_healthy then
      raise warning 'leavectrl_production_health_check_failed status=% release=%',
        v_status, coalesce(v_release,'unknown');
    end if;
  exception when others then
    v_elapsed := round(extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer;
    insert into private.production_health_checks(
      http_status, healthy, release_commit, response_ms, error_text
    ) values (
      null, false, null, v_elapsed, left(sqlerrm, 500)
    );
    raise warning 'leavectrl_production_health_check_error: %', sqlerrm;
  end;

  delete from private.production_health_checks
  where checked_at < clock_timestamp() - interval '30 days';
end;
$$;

revoke all on function private.run_production_health_check()
from public, anon, authenticated;
grant execute on function private.run_production_health_check() to postgres;

create or replace function private.assert_recent_production_health()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row private.production_health_checks%rowtype;
begin
  select *
    into v_row
  from private.production_health_checks
  order by checked_at desc
  limit 1;

  if v_row.id is null then
    raise exception 'production_health_missing';
  end if;

  if v_row.checked_at < clock_timestamp() - interval '10 minutes' then
    raise exception 'production_health_stale:%', v_row.checked_at;
  end if;

  if not v_row.healthy then
    raise exception 'production_health_unhealthy:%:%',
      coalesce(v_row.http_status::text,'no_status'),
      coalesce(v_row.error_text,'no_detail');
  end if;
end;
$$;

revoke all on function private.assert_recent_production_health()
from public, anon, authenticated;
grant execute on function private.assert_recent_production_health() to postgres;

select cron.schedule(
  'leavectrl-production-health-check',
  '7,22,37,52 * * * *',
  'select private.run_production_health_check();'
);

select cron.schedule(
  'leavectrl-production-health-assert',
  '9,24,39,54 * * * *',
  'select private.assert_recent_production_health();'
);
