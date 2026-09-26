-- Internal helpers must not be callable by ordinary signed-in clients.
-- They remain available to trusted server-side service-role workflows.

revoke execute on function public.validate_employee_invitation_for_delivery(uuid, text)
  from public, anon, authenticated;
grant execute on function public.validate_employee_invitation_for_delivery(uuid, text)
  to service_role;

revoke execute on function public.liability_scheduled_days(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.liability_scheduled_days(uuid, date, date)
  to service_role;
