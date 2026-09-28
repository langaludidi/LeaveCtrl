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
  v_reason text;
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
        new.organisation_id,v_leave.employee_id,new.actor_user_id,
        'leave_request',v_title,v_body,'leave_request',v_leave.id
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
        new.organisation_id,v_leave.employee_id,new.actor_user_id,
        'leave_cancellation',v_title,v_body,'leave_request',v_leave.id
      );

    elsif new.event_type in (
      'leave.request.approved','leave.request.declined',
      'leave.cancellation.approved','leave.cancellation.declined'
    ) then
      v_recipient:=v_employee.user_id;
      if v_recipient is not null and v_recipient is distinct from new.actor_user_id then
        v_title:=case new.event_type
          when 'leave.request.approved' then 'Leave approved'
          when 'leave.request.declined' then 'Leave declined'
          when 'leave.cancellation.approved' then 'Leave cancellation approved'
          else 'Leave cancellation declined'
        end;
        v_body:=format('%s for %s to %s.',v_title,v_leave.start_date,v_leave.end_date);

        if new.event_type in ('leave.request.declined','leave.cancellation.declined') then
          v_reason:=nullif(btrim(new.payload->>'note'),'');
          if v_reason is not null then
            v_body:=v_body || format(' Reason: %s',v_reason);
          end if;
        end if;

        perform private.insert_notification(
          new.organisation_id,v_recipient,'leave_decision',v_title,v_body,
          'leave_request',v_leave.id
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
        v_employee.first_name,v_employee.last_name,v_toil.hours,v_toil.leave_date
      );
      perform private.notify_request_approver(
        new.organisation_id,v_toil.employee_id,new.actor_user_id,
        'toil_request',v_title,v_body,'toil_request',v_toil.id
      );

    elsif new.event_type='toil.cancellation.requested' then
      v_title:='TOIL cancellation awaiting approval';
      v_body:=format(
        '%s %s requested cancellation of TOIL on %s.',
        v_employee.first_name,v_employee.last_name,v_toil.leave_date
      );
      perform private.notify_request_approver(
        new.organisation_id,v_toil.employee_id,new.actor_user_id,
        'toil_cancellation',v_title,v_body,'toil_request',v_toil.id
      );

    elsif new.event_type in (
      'toil.request.approved','toil.request.declined',
      'toil.cancellation.approved','toil.cancellation.declined'
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

        if new.event_type in ('toil.request.declined','toil.cancellation.declined') then
          v_reason:=nullif(btrim(new.payload->>'note'),'');
          if v_reason is not null then
            v_body:=v_body || format(' Reason: %s',v_reason);
          end if;
        end if;

        perform private.insert_notification(
          new.organisation_id,v_recipient,'toil_decision',v_title,v_body,
          'toil_request',v_toil.id
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.notifications_from_audit_event()
from public,anon,authenticated;
