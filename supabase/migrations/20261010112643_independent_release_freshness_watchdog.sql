-- Independent of GitHub Actions: record missed schedules even when Actions never runs.
create table private.production_release_freshness_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default clock_timestamp(),
  healthy boolean not null,
  scheduled_monitor_recent boolean not null default false,
  backup_recent boolean not null default false,
  backup_artifact_available boolean not null default false,
  monitor_run bigint,
  backup_run bigint,
  error_text text
);
revoke all on private.production_release_freshness_checks from public, anon, authenticated;
create index on private.production_release_freshness_checks (checked_at desc);

create function private.github_release_evidence(p_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_response extensions.http_response;
begin
  -- Fixed host and caller-controlled paths restricted to this repository's Actions API.
  if p_path !~ '^/actions/(workflows/|runs/)' then
    raise exception 'invalid_evidence_path';
  end if;
  select * into v_response from extensions.http((
    'GET', 'https://api.github.com/repos/langaludidi/LeaveCtrl' || p_path,
    array[extensions.http_header('User-Agent','LeaveCtrl-release-watchdog'),
          extensions.http_header('Accept','application/vnd.github+json')], null, null
  )::extensions.http_request);
  if v_response.status <> 200 then
    raise exception 'github_evidence_unavailable:%', v_response.status;
  end if;
  return v_response.content::jsonb;
end $$;
revoke all on function private.github_release_evidence(text) from public, anon, authenticated;

create function private.run_production_release_freshness_check()
returns void language plpgsql security definer set search_path='' as $$
declare
  v_monitor jsonb;
  v_backup jsonb;
  v_artifacts jsonb;
  v_monitor_ok boolean := false;
  v_backup_ok boolean := false;
  v_artifact_ok boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  begin
    v_monitor := private.github_release_evidence('/actions/workflows/production-monitor.yml/runs?branch=main&event=schedule&status=completed&per_page=1')->'workflow_runs'->0;
    v_backup := private.github_release_evidence('/actions/workflows/database-backup.yml/runs?branch=main&status=success&per_page=1')->'workflow_runs'->0;
    v_monitor_ok := coalesce(v_monitor->>'event'='schedule'
      and (v_monitor->>'updated_at')::timestamptz between v_now-interval '30 minutes' and v_now, false);
    v_backup_ok := coalesce(v_backup->>'conclusion'='success'
      and (v_backup->>'updated_at')::timestamptz between v_now-interval '30 hours' and v_now, false);
    if v_backup->>'id' is not null then
      v_artifacts := private.github_release_evidence('/actions/runs/' || (v_backup->>'id')::bigint || '/artifacts?per_page=100');
      select exists(select 1 from jsonb_array_elements(v_artifacts->'artifacts') a
        where a->>'name'='leavectrl-db-backup-' || (v_backup->>'id')
          and a->>'expired'='false' and (a->>'size_in_bytes')::bigint>0
          and a->>'digest' ~ '^sha256:[a-f0-9]{64}$'
          and (a->>'expires_at')::timestamptz>v_now) into v_artifact_ok;
    end if;
    insert into private.production_release_freshness_checks
      (healthy, scheduled_monitor_recent, backup_recent, backup_artifact_available, monitor_run, backup_run)
    values (v_monitor_ok and v_backup_ok and v_artifact_ok, v_monitor_ok, v_backup_ok,
      v_artifact_ok, (v_monitor->>'id')::bigint, (v_backup->>'id')::bigint);
  exception when others then
    insert into private.production_release_freshness_checks(healthy,error_text)
    values(false,left(sqlerrm,500));
  end;
  delete from private.production_release_freshness_checks where checked_at<v_now-interval '30 days';
end $$;
revoke all on function private.run_production_release_freshness_check() from public, anon, authenticated;
grant execute on function private.run_production_release_freshness_check() to postgres;

create function private.assert_recent_production_release_freshness()
returns void language plpgsql security definer set search_path='' as $$
declare v_row private.production_release_freshness_checks%rowtype;
begin
  select * into v_row from private.production_release_freshness_checks order by checked_at desc limit 1;
  if v_row.id is null or v_row.checked_at<clock_timestamp()-interval '10 minutes' then
    raise exception 'release_freshness_missing_or_stale';
  end if;
  if not v_row.healthy then
    raise exception 'release_freshness_failed:monitor=% backup=% artifact=% error=%',
      v_row.scheduled_monitor_recent,v_row.backup_recent,v_row.backup_artifact_available,v_row.error_text;
  end if;
end $$;
revoke all on function private.assert_recent_production_release_freshness() from public, anon, authenticated;
grant execute on function private.assert_recent_production_release_freshness() to postgres;

select cron.schedule('leavectrl-release-freshness-check','11,26,41,56 * * * *','select private.run_production_release_freshness_check();');
select cron.schedule('leavectrl-release-freshness-assert','13,28,43,58 * * * *','select private.assert_recent_production_release_freshness();');
