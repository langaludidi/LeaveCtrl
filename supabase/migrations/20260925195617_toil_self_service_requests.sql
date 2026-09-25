
alter table public.toil_ledger_entries
  drop constraint toil_ledger_entries_entry_type_check;

alter table public.toil_ledger_entries
  add constraint toil_ledger_entries_entry_type_check
  check (entry_type in ('earned','reserved','used','expired','adjustment','reversed'));

create table public.toil_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_date date not null,
  hours numeric(8,2) not null check (hours > 0 and hours <= 24),
  status text not null default 'pending_approval'
    check (status in ('pending_approval','approved','declined','withdrawn','cancelled')),
  note text,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index toil_requests_employee_date_idx
  on public.toil_requests(employee_id,leave_date);
create index toil_requests_org_status_idx
  on public.toil_requests(organisation_id,status);

alter table public.toil_requests enable row level security;

create policy toil_requests_visible
on public.toil_requests for select
using (
  private.is_self_employee(employee_id)
  or private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array[
      'hr_admin'::public.member_role,
      'org_admin'::public.member_role,
      'reporter'::public.member_role,
      'auditor'::public.member_role
    ]
  )
);

create or replace function public.submit_toil_request(
  p_leave_date date,
  p_hours numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,private
as $$
declare
  v_user_id uuid:=auth.uid();
  v_employee_id uuid;
  v_org_id uuid;
  v_scheduled numeric;
  v_balance numeric;
  v_request_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_hours<=0 or p_hours>24 then raise exception 'invalid_toil_hours'; end if;

  select e.id,e.organisation_id
    into v_employee_id,v_org_id
  from public.employees e
  where e.user_id=v_user_id
    and e.employment_status='active'
  order by e.created_at
  limit 1;

  if v_employee_id is null then raise exception 'employee_profile_required'; end if;

  v_scheduled:=private.scheduled_hours_for_employee(v_employee_id,p_leave_date);
  if coalesce(v_scheduled,0)<=0 then raise exception 'not_scheduled_working_day'; end if;
  if p_hours>v_scheduled then raise exception 'toil_exceeds_scheduled_hours'; end if;

  if exists(
    select 1 from public.public_holidays ph
    where ph.organisation_id=v_org_id
      and ph.holiday_date=p_leave_date
  ) then raise exception 'public_holiday_not_chargeable'; end if;

  if exists(
    select 1 from public.leave_requests lr
    where lr.employee_id=v_employee_id
      and lr.status in ('pending_approval','approved','cancellation_requested')
      and p_leave_date between lr.start_date and lr.end_date
  ) then raise exception 'overlapping_leave_request'; end if;

  if exists(
    select 1 from public.toil_requests tr
    where tr.employee_id=v_employee_id
      and tr.leave_date=p_leave_date
      and tr.status in ('pending_approval','approved')
  ) then raise exception 'overlapping_toil_request'; end if;

  select coalesce(sum(t.hours),0)
    into v_balance
  from public.toil_ledger_entries t
  where t.employee_id=v_employee_id;

  if v_balance<p_hours then raise exception 'insufficient_toil_balance'; end if;

  insert into public.toil_requests(
    organisation_id,employee_id,leave_date,hours,status,note
  ) values(
    v_org_id,v_employee_id,p_leave_date,p_hours,'pending_approval',
    nullif(btrim(p_note),'')
  )
  returning id into v_request_id;

  insert into public.toil_ledger_entries(
    organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by
  ) values(
    v_org_id,v_employee_id,'reserved',-p_hours,p_leave_date,
    'Pending TOIL request reservation',v_user_id
  );

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_org_id,v_user_id,'toil_request',v_request_id,'toil.request.submitted',
    jsonb_build_object('leave_date',p_leave_date,'hours',p_hours)
  );

  return v_request_id;
end;
$$;

revoke execute on function public.submit_toil_request(date,numeric,text)
from public,anon;
grant execute on function public.submit_toil_request(date,numeric,text)
to authenticated;

create or replace function public.decide_toil_request(
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
  if v_request.status<>'pending_approval' then raise exception 'request_not_pending'; end if;

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

  insert into public.toil_ledger_entries(
    organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by
  ) values(
    v_request.organisation_id,v_request.employee_id,'reversed',v_request.hours,
    v_request.leave_date,'Release pending TOIL reservation',v_user_id
  );

  if lower(p_decision)='approve' then
    insert into public.toil_ledger_entries(
      organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by
    ) values(
      v_request.organisation_id,v_request.employee_id,'used',-v_request.hours,
      v_request.leave_date,'Approved TOIL usage',v_user_id
    );
    v_status:='approved';
  else
    v_status:='declined';
  end if;

  update public.toil_requests
  set status=v_status,decided_at=now(),decided_by=v_user_id,updated_at=now()
  where id=v_request.id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_request.organisation_id,v_user_id,'toil_request',v_request.id,
    case when v_status='approved' then 'toil.request.approved'
         else 'toil.request.declined' end,
    jsonb_build_object('hours',v_request.hours,'note',nullif(btrim(p_note),''))
  );

  return v_status;
end;
$$;

revoke execute on function public.decide_toil_request(uuid,text,text)
from public,anon;
grant execute on function public.decide_toil_request(uuid,text,text)
to authenticated;

create or replace function public.withdraw_toil_request(
  p_request_id uuid
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
  if v_request.status<>'pending_approval' then raise exception 'request_not_withdrawable'; end if;

  insert into public.toil_ledger_entries(
    organisation_id,employee_id,entry_type,hours,effective_date,reason,created_by
  ) values(
    v_request.organisation_id,v_request.employee_id,'reversed',v_request.hours,
    current_date,'Withdrawn TOIL request reservation',v_user_id
  );

  update public.toil_requests
  set status='withdrawn',updated_at=now()
  where id=v_request.id;

  insert into public.audit_events(
    organisation_id,actor_user_id,entity_type,entity_id,event_type,payload
  ) values(
    v_request.organisation_id,v_user_id,'toil_request',v_request.id,
    'toil.request.withdrawn',jsonb_build_object('hours',v_request.hours)
  );

  return 'withdrawn';
end;
$$;

revoke execute on function public.withdraw_toil_request(uuid)
from public,anon;
grant execute on function public.withdraw_toil_request(uuid)
to authenticated;
