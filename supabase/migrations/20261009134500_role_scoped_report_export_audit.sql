-- Permit authenticated organisation members to record their own report export.
-- Membership is resolved from auth.uid(), never supplied by the caller.
create or replace function public.record_organisation_data_export(p_format text default 'json')
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_event_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if lower(coalesce(nullif(btrim(p_format), ''), 'json')) not in ('csv', 'pdf', 'xlsx', 'json') then
    raise exception 'invalid_export_format';
  end if;

  select m.organisation_id into v_org_id
  from public.organisation_memberships m
  where m.user_id = v_user_id
    and m.is_active
    and m.role in ('org_admin', 'hr_admin', 'reporter', 'auditor', 'manager', 'employee')
  order by m.created_at
  limit 1;

  if v_org_id is null then raise exception 'not_authorised'; end if;

  insert into public.audit_events (
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  ) values (
    v_org_id, v_user_id, 'organisation', v_org_id,
    'organisation.data.exported',
    jsonb_build_object('format', lower(coalesce(nullif(btrim(p_format), ''), 'json')), 'exported_at', now())
  ) returning id into v_event_id;

  return v_event_id;
end;
$function$;

revoke all on function public.record_organisation_data_export(text) from public, anon;
grant execute on function public.record_organisation_data_export(text) to authenticated;
