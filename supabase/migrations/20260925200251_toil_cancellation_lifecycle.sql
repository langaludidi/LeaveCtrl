
alter table public.toil_requests
  drop constraint toil_requests_status_check;

alter table public.toil_requests
  add constraint toil_requests_status_check
  check (status in (
    'pending_approval','approved','declined','withdrawn',
    'cancellation_requested','cancelled'
  ));

create or replace function public.request_toil_cancellation(
  p_request_id uuid,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid:=auth.uid();
  v_request public.toil_requests%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select tr.* into v_request
  from public.toil_requests tr
  join public.employees e on e.id=tr.employee_id
  where tr.id=p_request_id
    and e.user_id=v_user_id
  for update of tr;

  if v_request.id is null then raise exception 'request_not_found_or_not_owned'; end if;
  if v_request.status<>'approved' then raise exception 'request_not_approved'; end if;

  update public.toil_requests
  set status='cancellation_requested',updated_at=now()
  where id=v_request.id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_request.organisation_id,v_user_id,'toil_request',v_request.id,
    'toil.cancellation.requested',
    jsonb_build_object('hours',v_request.hours,'note',nullif(btrim(p_note),''))
  );

  return 'cancellation_requested';
end;
$$;

revoke execute on function public.request_toil_cancellation(uuid,text)
from public,anon;
grant execute on function public.request_toil_cancellation(uuid,text)
to authenticated;

create or replace function public.decide_toil_cancellation(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid:=auth.uid();
  v_request public.toil_requests%rowtype;
  v_actor_employee_id uuid;
  v_authorised boolean:=false;
  v_status text;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select * into v_request
  from public.toil_requests
  where id=p_request_id
  for update;

  if v_request.id is null then raise exception 'request_not_found'; end if;
  if v_request.status<>'cancellation_requested' then
    raise exception 'cancellation_not_pending';
  end if;

  select id into v_actor_employee_id
  from public.employees
  where organisation_id=v_request.organisation_id
    and user_id=v_user_id
    and employment_status='active'
  limit 1;

  if v_actor_employee_id=v_request.employee_id then
    raise exception 'self_approval_not_allowed';
  end if;

  v_authorised:=
    private.manages_employee(v_request.employee_id)
    or private.has_org_role(
      v_request.organisation_id,
      array['hr_admin'::public.member_role,'org_admin'::public.member_role]
    );

  if not v_authorised then raise exception 'not_authorised'; end if;
  if lower(p_decision) not in ('approve','decline') then
    raise exception 'invalid_decision';
  end if;

  if lower(p_decision)='approve' then
    insert into public.toil_ledger_entries(
      organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by
    ) values(
      v_request.organisation_id,v_request.employee_id,'reversed',v_request.hours,
      current_date,'Approved TOIL cancellation',v_user_id
    );
    v_status:='cancelled';
  else
    v_status:='approved';
  end if;

  update public.toil_requests
  set status=v_status,decided_at=now(),decided_by=v_user_id,updated_at=now()
  where id=v_request.id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_request.organisation_id,v_user_id,'toil_request',v_request.id,
    case when v_status='cancelled'
      then 'toil.cancellation.approved'
      else 'toil.cancellation.declined'
    end,
    jsonb_build_object('hours',v_request.hours,'note',nullif(btrim(p_note),''))
  );

  return v_status;
end;
$$;

revoke execute on function public.decide_toil_cancellation(uuid,text,text)
from public,anon;
grant execute on function public.decide_toil_cancellation(uuid,text,text)
to authenticated;
