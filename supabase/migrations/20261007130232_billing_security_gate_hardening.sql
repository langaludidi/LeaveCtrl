-- Billing event, adjustment and operator tables are intentionally not client-accessible.
-- Keep the privilege revocations and add explicit deny policies so this contract is
-- visible to RLS tooling and remains defense-in-depth if grants change later.

revoke all on table public.billing_events from public, anon, authenticated;
revoke all on table public.billing_adjustments from public, anon, authenticated;
revoke all on table private.billing_operators from public, anon, authenticated;

drop policy if exists billing_events_no_client_access on public.billing_events;
create policy billing_events_no_client_access
on public.billing_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists billing_adjustments_no_client_access on public.billing_adjustments;
create policy billing_adjustments_no_client_access
on public.billing_adjustments
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists billing_operators_no_client_access on private.billing_operators;
create policy billing_operators_no_client_access
on private.billing_operators
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
