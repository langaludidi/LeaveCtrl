
create or replace function public.get_workforce_calendar(
  p_start_date date,
  p_end_date date
)
returns table(
  employee_id uuid,
  absence_date date,
  display_label text,
  colour_token text,
  source_kind text,
  status text,
  hours numeric,
  can_view_detail boolean
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_org_id uuid;
  v_admin boolean:=false;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date<p_start_date then
    raise exception 'invalid_date_range';
  end if;
  if p_end_date-p_start_date>370 then
    raise exception 'calendar_range_too_large';
  end if;

  select m.organisation_id
    into v_org_id
  from public.organisation_memberships m
  where m.user_id=v_user_id
    and m.is_active
  order by m.created_at
  limit 1;

  if v_org_id is null then
    raise exception 'active_organisation_required';
  end if;

  v_admin:=private.has_org_role(
    v_org_id,
    array[
      'org_admin'::public.member_role,
      'hr_admin'::public.member_role
    ]
  );

  return query
  with leave_rows as (
    select
      r.employee_id,
      d.leave_date as absence_date,
      lt.name as private_label,
      coalesce(lt.colour_token,'teal') as private_colour,
      r.status::text as private_status,
      (
        private.is_self_employee(r.employee_id)
        or private.manages_employee(r.employee_id)
        or v_admin
      ) as detail_allowed
    from public.leave_requests r
    join public.leave_request_days d
      on d.request_id=r.id
     and d.organisation_id=r.organisation_id
    join public.leave_types lt
      on lt.id=r.leave_type_id
     and lt.organisation_id=r.organisation_id
    where r.organisation_id=v_org_id
      and r.status in ('approved','cancellation_requested')
      and d.leave_date between p_start_date and p_end_date
      and coalesce(d.chargeable_quantity,0)>0
  ),
  toil_rows as (
    select
      tr.employee_id,
      tr.leave_date as absence_date,
      'TOIL'::text as private_label,
      'purple'::text as private_colour,
      tr.status::text as private_status,
      tr.hours,
      (
        private.is_self_employee(tr.employee_id)
        or private.manages_employee(tr.employee_id)
        or v_admin
      ) as detail_allowed
    from public.toil_requests tr
    where tr.organisation_id=v_org_id
      and tr.status in ('approved','cancellation_requested')
      and tr.leave_date between p_start_date and p_end_date
  )
  select
    l.employee_id,
    l.absence_date,
    case when l.detail_allowed then l.private_label else 'Away' end,
    case when l.detail_allowed then l.private_colour else 'teal' end,
    case when l.detail_allowed then 'leave' else 'away' end,
    case when l.detail_allowed then l.private_status else 'approved' end,
    null::numeric,
    l.detail_allowed
  from leave_rows l

  union all

  select
    t.employee_id,
    t.absence_date,
    case when t.detail_allowed then t.private_label else 'Away' end,
    case when t.detail_allowed then t.private_colour else 'teal' end,
    case when t.detail_allowed then 'toil' else 'away' end,
    case when t.detail_allowed then t.private_status else 'approved' end,
    case when t.detail_allowed then t.hours else null end,
    t.detail_allowed
  from toil_rows t

  order by absence_date,employee_id;
end;
$$;

revoke execute on function public.get_workforce_calendar(date,date)
from public,anon;
grant execute on function public.get_workforce_calendar(date,date)
to authenticated;
