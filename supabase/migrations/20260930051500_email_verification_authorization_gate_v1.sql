-- P0 identity gate: an email/password identity must carry native Supabase
-- confirmation evidence before it can receive LeaveCtrl membership or protected
-- tenant access. This is defence in depth; Supabase Confirm Email remains the
-- primary control and must stay enabled in production.

create or replace function private.is_verified_email_identity(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id=p_user_id
      and u.email_confirmed_at is not null
      and (
        u.confirmation_sent_at is not null
        or u.invited_at is not null
      )
  );
$$;

revoke all on function private.is_verified_email_identity(uuid)
from public, anon;
grant execute on function private.is_verified_email_identity(uuid)
to authenticated;

create or replace function private.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select private.is_verified_email_identity(auth.uid())
    and exists (
      select 1
      from public.organisation_memberships m
      where m.organisation_id=org_id
        and m.user_id=auth.uid()
        and m.is_active
    )
$$;

create or replace function private.has_org_role(
  org_id uuid,
  allowed_roles public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select private.is_verified_email_identity(auth.uid())
    and exists (
      select 1
      from public.organisation_memberships m
      where m.organisation_id=org_id
        and m.user_id=auth.uid()
        and m.is_active
        and m.role=any(allowed_roles)
    )
$$;

create or replace function private.is_self_employee(employee uuid)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select private.is_verified_email_identity(auth.uid())
    and exists (
      select 1
      from public.employees e
      join public.organisation_memberships m
        on m.organisation_id=e.organisation_id
       and m.user_id=e.user_id
       and m.is_active
      where e.id=employee
        and e.user_id=auth.uid()
        and e.employment_status='active'
    )
$$;

create or replace function private.manages_employee(employee uuid)
returns boolean
language sql
stable
security definer
set search_path=public,private
as $$
  select private.is_verified_email_identity(auth.uid())
    and (
      exists (
        select 1
        from public.employee_employment_conditions ec
        join public.employees manager on manager.id=ec.manager_employee_id
        join public.organisation_memberships membership
          on membership.organisation_id=ec.organisation_id
         and membership.user_id=manager.user_id
         and membership.is_active
        where ec.employee_id=employee
          and ec.effective_from<=current_date
          and (ec.effective_to is null or ec.effective_to>=current_date)
          and manager.user_id=auth.uid()
          and manager.organisation_id=ec.organisation_id
          and manager.employment_status='active'
      )
      or exists (
        select 1
        from public.employees report
        join public.employees manager on manager.id=report.manager_employee_id
        join public.organisation_memberships membership
          on membership.organisation_id=report.organisation_id
         and membership.user_id=manager.user_id
         and membership.is_active
        where report.id=employee
          and not exists (
            select 1
            from public.employee_employment_conditions ec
            where ec.employee_id=report.id
              and ec.effective_from<=current_date
              and (ec.effective_to is null or ec.effective_to>=current_date)
          )
          and manager.user_id=auth.uid()
          and manager.organisation_id=report.organisation_id
          and manager.employment_status='active'
      )
    );
$$;

grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.member_role[]) to authenticated;
grant execute on function private.is_self_employee(uuid) to authenticated;
grant execute on function private.manages_employee(uuid) to authenticated;

create or replace function private.enforce_single_active_organisation_membership()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
begin
  if new.is_active
     and not private.is_verified_email_identity(new.user_id) then
    raise exception 'email_verification_required';
  end if;

  if new.is_active and exists(
    select 1
    from public.organisation_memberships m
    where m.user_id=new.user_id
      and m.is_active
      and m.organisation_id<>new.organisation_id
      and m.id<>new.id
  ) then
    raise exception 'account_already_linked_to_organisation';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_single_active_organisation_membership()
from public, anon, authenticated;

create or replace function private.enforce_verified_employee_identity_link()
returns trigger
language plpgsql
security definer
set search_path=public,private
as $$
begin
  if new.user_id is not null
     and new.employment_status='active'
     and not private.is_verified_email_identity(new.user_id) then
    raise exception 'email_verification_required';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_verified_employee_identity_link()
from public, anon, authenticated;

drop trigger if exists enforce_verified_employee_identity_link
on public.employees;

create trigger enforce_verified_employee_identity_link
before insert or update of user_id,employment_status
on public.employees
for each row
execute function private.enforce_verified_employee_identity_link();

comment on function private.is_verified_email_identity(uuid) is
'Authorization helper: requires native Supabase email confirmation/invitation evidence before LeaveCtrl tenant access.';

comment on trigger enforce_verified_employee_identity_link on public.employees is
'Prevents an unverified Auth identity from becoming an active LeaveCtrl employee.';
