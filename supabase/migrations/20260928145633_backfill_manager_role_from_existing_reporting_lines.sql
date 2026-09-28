-- Bring existing reporting lines into alignment with the manager-role invariant.

insert into public.organisation_memberships(
  organisation_id, user_id, role, is_active
)
select distinct
  manager.organisation_id,
  manager.user_id,
  'manager'::public.member_role,
  true
from public.employees manager
where manager.user_id is not null
  and manager.employment_status = 'active'
  and exists(
    select 1
    from public.employees report
    where report.organisation_id = manager.organisation_id
      and report.manager_employee_id = manager.id
      and report.employment_status = 'active'
  )
on conflict(organisation_id,user_id,role)
do update set is_active = true;

update public.employee_invitations invitation
set grant_manager_role = true
where invitation.employee_id is not null
  and invitation.accepted_at is null
  and invitation.expires_at > now()
  and exists(
    select 1
    from public.employees report
    where report.organisation_id = invitation.organisation_id
      and report.manager_employee_id = invitation.employee_id
      and report.employment_status = 'active'
  );
