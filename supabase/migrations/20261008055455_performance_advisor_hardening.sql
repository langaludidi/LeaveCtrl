-- V1 performance hardening from the live Supabase performance advisor.
create index if not exists billing_accounts_price_id_idx
  on public.billing_accounts(price_id);

drop policy if exists absence_events_read on public.absence_events;
create policy absence_events_read
on public.absence_events for select to authenticated
using (
  exists (
    select 1
    from public.employees e
    where e.id=employee_id
      and e.user_id=(select auth.uid())
  )
  or private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array[
      'hr_admin'::public.member_role,
      'org_admin'::public.member_role,
      'auditor'::public.member_role
    ]
  )
);
