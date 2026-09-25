
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications(recipient_user_id,created_at desc);

create index notifications_recipient_unread_idx
  on public.notifications(recipient_user_id,created_at desc)
  where read_at is null;

create index notifications_org_entity_idx
  on public.notifications(organisation_id,entity_type,entity_id);

alter table public.notifications enable row level security;

create policy notifications_own_read
on public.notifications
for select
to authenticated
using (recipient_user_id=(select auth.uid()));

create policy notifications_own_mark_read
on public.notifications
for update
to authenticated
using (recipient_user_id=(select auth.uid()))
with check (recipient_user_id=(select auth.uid()));

revoke insert,delete,truncate,references,trigger on public.notifications
from authenticated,anon;
revoke update on public.notifications from authenticated,anon;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;

create or replace function private.current_manager_user_id(p_employee_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_employee public.employees%rowtype;
  v_manager_employee_id uuid;
  v_user_id uuid;
  v_business_date date;
begin
  select * into v_employee
  from public.employees e
  where e.id=p_employee_id;

  if v_employee.id is null then
    return null;
  end if;

  v_business_date:=private.organisation_business_date(v_employee.organisation_id);

  select ec.manager_employee_id
    into v_manager_employee_id
  from public.employee_employment_conditions ec
  where ec.employee_id=p_employee_id
    and ec.effective_from<=v_business_date
    and (ec.effective_to is null or ec.effective_to>=v_business_date)
  order by ec.effective_from desc
  limit 1;

  if not found then
    v_manager_employee_id:=v_employee.manager_employee_id;
  end if;

  if v_manager_employee_id is null then
    return null;
  end if;

  select manager.user_id
    into v_user_id
  from public.employees manager
  join public.organisation_memberships membership
    on membership.organisation_id=manager.organisation_id
   and membership.user_id=manager.user_id
   and membership.is_active
  where manager.id=v_manager_employee_id
    and manager.organisation_id=v_employee.organisation_id
    and manager.employment_status='active'
    and manager.user_id is not null
  limit 1;

  return v_user_id;
end;
$$;

revoke all on function private.current_manager_user_id(uuid)
from public,anon,authenticated;

create or replace function private.insert_notification(
  p_org_id uuid,
  p_recipient_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if p_recipient_user_id is null then
    return;
  end if;

  insert into public.notifications(
    organisation_id,
    recipient_user_id,
    kind,
    title,
    body,
    entity_type,
    entity_id
  )
  values(
    p_org_id,
    p_recipient_user_id,
    p_kind,
    p_title,
    p_body,
    p_entity_type,
    p_entity_id
  );
end;
$$;

revoke all on function private.insert_notification(uuid,uuid,text,text,text,text,uuid)
from public,anon,authenticated;

create or replace function private.notify_request_approver(
  p_org_id uuid,
  p_employee_id uuid,
  p_actor_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_manager_user_id uuid;
begin
  v_manager_user_id:=private.current_manager_user_id(p_employee_id);

  if v_manager_user_id is not null
     and v_manager_user_id is distinct from p_actor_user_id then
    perform private.insert_notification(
      p_org_id,
      v_manager_user_id,
      p_kind,
      p_title,
      p_body,
      p_entity_type,
      p_entity_id
    );
    return;
  end if;

  insert into public.notifications(
    organisation_id,
    recipient_user_id,
    kind,
    title,
    body,
    entity_type,
    entity_id
  )
  select distinct
    p_org_id,
    m.user_id,
    p_kind,
    p_title,
    p_body,
    p_entity_type,
    p_entity_id
  from public.organisation_memberships m
  where m.organisation_id=p_org_id
    and m.is_active
    and m.role in ('org_admin','hr_admin')
    and m.user_id is distinct from p_actor_user_id;
end;
$$;

revoke all on function private.notify_request_approver(uuid,uuid,uuid,text,text,text,text,uuid)
from public,anon,authenticated;

create or replace function private.notifications_from_audit_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_leave public.leave_requests%rowtype;
  v_toil public.toil_requests%rowtype;
  v_employee public.employees%rowtype;
  v_leave_type_name text;
  v_recipient uuid;
  v_title text;
  v_body text;
begin
  if new.event_type like 'leave.%' then
    select r.* into v_leave
    from public.leave_requests r
    where r.id=new.entity_id;

    if v_leave.id is null then
      return new;
    end if;

    select e.* into v_employee
    from public.employees e
    where e.id=v_leave.employee_id;

    select lt.name into v_leave_type_name
    from public.leave_types lt
    where lt.id=v_leave.leave_type_id;

    if new.event_type='leave.request.submitted' then
      v_title:='Leave request awaiting approval';
      v_body:=format(
        '%s %s submitted %s for %s to %s.',
        v_employee.first_name,
        v_employee.last_name,
        coalesce(v_leave_type_name,'leave'),
        v_leave.start_date,
        v_leave.end_date
      );
      perform private.notify_request_approver(
        new.organisation_id,
        v_leave.employee_id,
        new.actor_user_id,
        'leave_request',
        v_title,
        v_body,
        'leave_request',
        v_leave.id
      );

    elsif new.event_type='leave.cancellation.requested' then
      v_title:='Leave cancellation awaiting approval';
      v_body:=format(
        '%s %s requested cancellation of approved %s.',
        v_employee.first_name,
        v_employee.last_name,
        coalesce(v_leave_type_name,'leave')
      );
      perform private.notify_request_approver(
        new.organisation_id,
        v_leave.employee_id,
        new.actor_user_id,
        'leave_cancellation',
        v_title,
        v_body,
        'leave_request',
        v_leave.id
      );

    elsif new.event_type in (
      'leave.request.approved',
      'leave.request.declined',
      'leave.cancellation.approved',
      'leave.cancellation.declined'
    ) then
      v_recipient:=v_employee.user_id;
      if v_recipient is not null and v_recipient is distinct from new.actor_user_id then
        v_title:=case new.event_type
          when 'leave.request.approved' then 'Leave approved'
          when 'leave.request.declined' then 'Leave declined'
          when 'leave.cancellation.approved' then 'Leave cancellation approved'
          else 'Leave cancellation declined'
        end;
        v_body:=format(
          '%s for %s to %s.',
          v_title,
          v_leave.start_date,
          v_leave.end_date
        );
        perform private.insert_notification(
          new.organisation_id,
          v_recipient,
          'leave_decision',
          v_title,
          v_body,
          'leave_request',
          v_leave.id
        );
      end if;
    end if;

  elsif new.event_type like 'toil.%' then
    select tr.* into v_toil
    from public.toil_requests tr
    where tr.id=new.entity_id;

    if v_toil.id is null then
      return new;
    end if;

    select e.* into v_employee
    from public.employees e
    where e.id=v_toil.employee_id;

    if new.event_type='toil.request.submitted' then
      v_title:='TOIL request awaiting approval';
      v_body:=format(
        '%s %s requested %s hours TOIL on %s.',
        v_employee.first_name,
        v_employee.last_name,
        v_toil.hours,
        v_toil.leave_date
      );
      perform private.notify_request_approver(
        new.organisation_id,
        v_toil.employee_id,
        new.actor_user_id,
        'toil_request',
        v_title,
        v_body,
        'toil_request',
        v_toil.id
      );

    elsif new.event_type='toil.cancellation.requested' then
      v_title:='TOIL cancellation awaiting approval';
      v_body:=format(
        '%s %s requested cancellation of TOIL on %s.',
        v_employee.first_name,
        v_employee.last_name,
        v_toil.leave_date
      );
      perform private.notify_request_approver(
        new.organisation_id,
        v_toil.employee_id,
        new.actor_user_id,
        'toil_cancellation',
        v_title,
        v_body,
        'toil_request',
        v_toil.id
      );

    elsif new.event_type in (
      'toil.request.approved',
      'toil.request.declined',
      'toil.cancellation.approved',
      'toil.cancellation.declined'
    ) then
      v_recipient:=v_employee.user_id;
      if v_recipient is not null and v_recipient is distinct from new.actor_user_id then
        v_title:=case new.event_type
          when 'toil.request.approved' then 'TOIL approved'
          when 'toil.request.declined' then 'TOIL declined'
          when 'toil.cancellation.approved' then 'TOIL cancellation approved'
          else 'TOIL cancellation declined'
        end;
        v_body:=format('%s for %s.',v_title,v_toil.leave_date);
        perform private.insert_notification(
          new.organisation_id,
          v_recipient,
          'toil_decision',
          v_title,
          v_body,
          'toil_request',
          v_toil.id
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.notifications_from_audit_event()
from public,anon,authenticated;

drop trigger if exists audit_event_notification_trigger
on public.audit_events;

create trigger audit_event_notification_trigger
after insert on public.audit_events
for each row
execute function private.notifications_from_audit_event();
