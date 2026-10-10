\set ON_ERROR_STOP on
begin;
-- Fixtures roll back; the test neither changes production nor calls external APIs.
do $$
begin
  if has_function_privilege('anon','private.run_production_release_freshness_check()','EXECUTE')
    or has_function_privilege('authenticated','private.run_production_release_freshness_check()','EXECUTE')
    or has_function_privilege('authenticated','private.github_release_evidence(text)','EXECUTE') then
    raise exception 'watchdog_privilege_leak';
  end if;
end $$;
truncate private.production_release_freshness_checks;
do $$
begin
  begin
    perform private.assert_recent_production_release_freshness();
    raise exception 'expected_missing_failure';
  exception when others then
    if sqlerrm <> 'release_freshness_missing_or_stale' then raise; end if;
  end;
end $$;
insert into private.production_release_freshness_checks(healthy,checked_at)
values(true,clock_timestamp()-interval '11 minutes');
do $$
begin
  begin
    perform private.assert_recent_production_release_freshness();
    raise exception 'expected_stale_failure';
  exception when others then
    if sqlerrm <> 'release_freshness_missing_or_stale' then raise; end if;
  end;
end $$;
insert into private.production_release_freshness_checks(healthy,scheduled_monitor_recent,backup_recent,backup_artifact_available)
values(false,false,true,true);
do $$
begin
  begin
    perform private.assert_recent_production_release_freshness();
    raise exception 'expected_degraded_failure';
  exception when others then
    if sqlerrm not like 'release_freshness_failed:monitor=f backup=t artifact=t%' then raise; end if;
  end;
end $$;
insert into private.production_release_freshness_checks(healthy,scheduled_monitor_recent,backup_recent,backup_artifact_available)
values(true,true,true,true);
select private.assert_recent_production_release_freshness();
rollback;
\echo 'PASS: independent watchdog permissions, missing/stale/degraded rejection and healthy acceptance'
