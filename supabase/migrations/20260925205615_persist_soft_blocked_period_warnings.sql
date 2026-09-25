
create table public.absence_request_warnings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  leave_request_id uuid references public.leave_requests(id) on delete cascade,
  toil_request_id uuid references public.toil_requests(id) on delete cascade,
  warning_code text not null,
  source_entity_type text not null,
  source_entity_id uuid,
  message text not null,
  created_at timestamptz not null default now(),
  constraint absence_request_warnings_one_request_check
    check (
      (leave_request_id is not null and toil_request_id is null)
      or
      (leave_request_id is null and toil_request_id is not null)
    )
);

create index absence_warnings_leave_request_idx
  on public.absence_request_warnings(leave_request_id)
  where leave_request_id is not null;
create index absence_warnings_toil_request_idx
  on public.absence_request_warnings(toil_request_id)
  where toil_request_id is not null;
create index absence_warnings_org_idx
  on public.absence_request_warnings(organisation_id);

alter table public.absence_request_warnings enable row level security;

create policy absence_request_warnings_visible
on public.absence_request_warnings for select
using (
  (
    leave_request_id is not null
    and exists(
      select 1
      from public.leave_requests lr
      where lr.id=leave_request_id
        and (
          private.is_self_employee(lr.employee_id)
          or private.manages_employee(lr.employee_id)
          or private.has_org_role(
            lr.organisation_id,
            array[
              'hr_admin'::public.member_role,
              'org_admin'::public.member_role,
              'reporter'::public.member_role,
              'auditor'::public.member_role
            ]
          )
        )
    )
  )
  or
  (
    toil_request_id is not null
    and exists(
      select 1
      from public.toil_requests tr
      where tr.id=toil_request_id
        and (
          private.is_self_employee(tr.employee_id)
          or private.manages_employee(tr.employee_id)
          or private.has_org_role(
            tr.organisation_id,
            array[
              'hr_admin'::public.member_role,
              'org_admin'::public.member_role,
              'reporter'::public.member_role,
              'auditor'::public.member_role
            ]
          )
        )
    )
  )
);

create or replace function private.capture_leave_soft_block_warnings()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
begin
  insert into public.absence_request_warnings(
    organisation_id,
    leave_request_id,
    warning_code,
    source_entity_type,
    source_entity_id,
    message
  )
  select
    new.organisation_id,
    new.id,
    'soft_blocked_period',
    'blocked_period',
    bp.id,
    case
      when nullif(btrim(bp.reason),'') is not null
        then bp.name||': '||bp.reason
      else bp.name
    end
  from public.blocked_periods bp
  where bp.organisation_id=new.organisation_id
    and not bp.hard_block
    and daterange(bp.start_date,bp.end_date,'[]')
        && daterange(new.start_date,new.end_date,'[]')
    and (bp.leave_type_id is null or bp.leave_type_id=new.leave_type_id);

  return new;
end;
$$;

revoke execute on function private.capture_leave_soft_block_warnings()
from public,anon,authenticated;

drop trigger if exists capture_leave_soft_block_warnings
on public.leave_requests;

create trigger capture_leave_soft_block_warnings
after insert on public.leave_requests
for each row
execute function private.capture_leave_soft_block_warnings();

create or replace function private.capture_toil_soft_block_warnings()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
begin
  insert into public.absence_request_warnings(
    organisation_id,
    toil_request_id,
    warning_code,
    source_entity_type,
    source_entity_id,
    message
  )
  select
    new.organisation_id,
    new.id,
    'soft_blocked_period',
    'blocked_period',
    bp.id,
    case
      when nullif(btrim(bp.reason),'') is not null
        then bp.name||': '||bp.reason
      else bp.name
    end
  from public.blocked_periods bp
  where bp.organisation_id=new.organisation_id
    and not bp.hard_block
    and bp.leave_type_id is null
    and new.leave_date between bp.start_date and bp.end_date;

  return new;
end;
$$;

revoke execute on function private.capture_toil_soft_block_warnings()
from public,anon,authenticated;

drop trigger if exists capture_toil_soft_block_warnings
on public.toil_requests;

create trigger capture_toil_soft_block_warnings
after insert on public.toil_requests
for each row
execute function private.capture_toil_soft_block_warnings();
