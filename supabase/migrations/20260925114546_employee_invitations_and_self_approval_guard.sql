create table public.employee_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null,
  first_name text not null,
  last_name text not null,
  employee_number text,
  department_id uuid references public.departments(id) on delete set null,
  manager_employee_id uuid references public.employees(id) on delete set null,
  work_schedule_id uuid references public.work_schedules(id) on delete set null,
  start_date date not null,
  grant_manager_role boolean not null default false,
  token_hash bytea not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.employee_invitations enable row level security;

create index employee_invitations_org_idx on public.employee_invitations(organisation_id);
create index employee_invitations_email_idx on public.employee_invitations(lower(email));
create index employee_invitations_manager_idx on public.employee_invitations(manager_employee_id);
create index employee_invitations_department_idx on public.employee_invitations(department_id);
create index employee_invitations_schedule_idx on public.employee_invitations(work_schedule_id);

create policy employee_invitations_admin_read on public.employee_invitations
for select using (
  private.has_org_role(
    organisation_id,
    array['org_admin'::public.member_role,'hr_admin'::public.member_role]
  )
);

create or replace function public.create_employee_invitation(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_start_date date,
  p_employee_number text default null,
  p_department_id uuid default null,
  p_manager_employee_id uuid default null,
  p_work_schedule_id uuid default null,
  p_grant_manager_role boolean default false
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_token text;
  v_schedule_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select m.organisation_id
    into v_org_id
  from public.organisation_memberships m
  where m.user_id = v_user_id
    and m.is_active
    and m.role in ('org_admin','hr_admin')
  order by m.created_at
  limit 1;

  if v_org_id is null then raise exception 'not_authorised'; end if;

  if nullif(btrim(p_email), '') is null
     or nullif(btrim(p_first_name), '') is null
     or nullif(btrim(p_last_name), '') is null then
    raise exception 'required_fields_missing';
  end if;

  if exists (
    select 1 from public.employees e
    where e.organisation_id = v_org_id
      and lower(e.email) = lower(btrim(p_email))
  ) then
    raise exception 'employee_email_already_exists';
  end if;

  if p_department_id is not null and not exists (
    select 1 from public.departments d
    where d.id = p_department_id and d.organisation_id = v_org_id
  ) then
    raise exception 'invalid_department';
  end if;

  if p_manager_employee_id is not null and not exists (
    select 1 from public.employees e
    where e.id = p_manager_employee_id and e.organisation_id = v_org_id
  ) then
    raise exception 'invalid_manager';
  end if;

  if p_work_schedule_id is not null then
    select ws.id into v_schedule_id
    from public.work_schedules ws
    where ws.id = p_work_schedule_id and ws.organisation_id = v_org_id;
  else
    select ws.id into v_schedule_id
    from public.work_schedules ws
    where ws.organisation_id = v_org_id
    order by ws.created_at
    limit 1;
  end if;

  if v_schedule_id is null then raise exception 'work_schedule_required'; end if;

  v_token := encode(gen_random_bytes(24), 'hex');

  insert into public.employee_invitations(
    organisation_id, email, first_name, last_name, employee_number,
    department_id, manager_employee_id, work_schedule_id, start_date,
    grant_manager_role, token_hash, created_by
  )
  values (
    v_org_id, lower(btrim(p_email)), btrim(p_first_name), btrim(p_last_name),
    nullif(btrim(p_employee_number), ''), p_department_id, p_manager_employee_id,
    v_schedule_id, p_start_date, p_grant_manager_role,
    digest(v_token, 'sha256'), v_user_id
  );

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, event_type, payload
  )
  values (
    v_org_id, v_user_id, 'employee_invitation', 'employee.invitation.created',
    jsonb_build_object(
      'email', lower(btrim(p_email)),
      'grant_manager_role', p_grant_manager_role
    )
  );

  return v_token;
end;
$$;

revoke execute on function public.create_employee_invitation(text,text,text,date,text,uuid,uuid,uuid,boolean) from anon;
revoke execute on function public.create_employee_invitation(text,text,text,date,text,uuid,uuid,uuid,boolean) from public;
grant execute on function public.create_employee_invitation(text,text,text,date,text,uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.claim_employee_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email',''));
  v_invitation public.employee_invitations%rowtype;
  v_employee_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select *
    into v_invitation
  from public.employee_invitations i
  where i.token_hash = digest(p_token, 'sha256')
    and i.accepted_at is null
    and i.expires_at > now()
  for update;

  if v_invitation.id is null then raise exception 'invitation_invalid_or_expired'; end if;
  if lower(v_invitation.email) <> v_email then raise exception 'invitation_email_mismatch'; end if;

  insert into public.organisation_memberships(organisation_id, user_id, role)
  values (v_invitation.organisation_id, v_user_id, 'employee')
  on conflict do nothing;

  if v_invitation.grant_manager_role then
    insert into public.organisation_memberships(organisation_id, user_id, role)
    values (v_invitation.organisation_id, v_user_id, 'manager')
    on conflict do nothing;
  end if;

  insert into public.employees(
    organisation_id, user_id, employee_number, first_name, last_name, email,
    start_date, department_id, manager_employee_id
  )
  values (
    v_invitation.organisation_id, v_user_id, v_invitation.employee_number,
    v_invitation.first_name, v_invitation.last_name, v_invitation.email,
    v_invitation.start_date, v_invitation.department_id, v_invitation.manager_employee_id
  )
  returning id into v_employee_id;

  insert into public.employee_schedule_assignments(
    organisation_id, employee_id, work_schedule_id, effective_from
  )
  values (
    v_invitation.organisation_id, v_employee_id,
    v_invitation.work_schedule_id, v_invitation.start_date
  );

  update public.employee_invitations
  set accepted_at = now()
  where id = v_invitation.id;

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_invitation.organisation_id, v_user_id, 'employee', v_employee_id,
    'employee.invitation.accepted',
    jsonb_build_object('invitation_id', v_invitation.id)
  );

  return v_employee_id;
end;
$$;

revoke execute on function public.claim_employee_invitation(text) from anon;
revoke execute on function public.claim_employee_invitation(text) from public;
grant execute on function public.claim_employee_invitation(text) to authenticated;

create or replace function public.decide_leave_request(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns public.leave_request_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.leave_requests%rowtype;
  v_entitlement_id uuid;
  v_actor_employee_id uuid;
  v_authorised boolean := false;
  v_new_status public.leave_request_status;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;

  select * into v_request
  from public.leave_requests
  where id = p_request_id
  for update;

  if v_request.id is null then raise exception 'request_not_found'; end if;
  if v_request.status <> 'pending_approval' then raise exception 'request_not_pending'; end if;

  select e.id into v_actor_employee_id
  from public.employees e
  where e.organisation_id = v_request.organisation_id
    and e.user_id = v_user_id
    and e.employment_status = 'active'
  limit 1;

  if v_actor_employee_id = v_request.employee_id then
    raise exception 'self_approval_not_allowed';
  end if;

  v_authorised :=
    private.manages_employee(v_request.employee_id)
    or private.has_org_role(
      v_request.organisation_id,
      array['hr_admin'::public.member_role,'org_admin'::public.member_role]
    );

  if not v_authorised then raise exception 'not_authorised'; end if;
  if lower(p_decision) not in ('approve','decline') then raise exception 'invalid_decision'; end if;

  select id into v_entitlement_id
  from public.leave_entitlements
  where organisation_id = v_request.organisation_id
    and employee_id = v_request.employee_id
    and leave_type_id = v_request.leave_type_id
    and v_request.start_date between cycle_start and cycle_end
  order by cycle_start desc
  limit 1;

  insert into public.leave_ledger_entries(
    organisation_id, employee_id, leave_type_id, entitlement_id, request_id,
    entry_type, quantity, effective_date, reason, source_metadata, created_by
  )
  values (
    v_request.organisation_id, v_request.employee_id, v_request.leave_type_id,
    v_entitlement_id, v_request.id, 'leave_reversed', v_request.quantity,
    v_request.start_date, 'Release pending leave reservation',
    jsonb_build_object('decision', lower(p_decision)), v_user_id
  );

  if lower(p_decision) = 'approve' then
    v_new_status := 'approved';
    insert into public.leave_ledger_entries(
      organisation_id, employee_id, leave_type_id, entitlement_id, request_id,
      entry_type, quantity, effective_date, reason, source_metadata, created_by
    )
    values (
      v_request.organisation_id, v_request.employee_id, v_request.leave_type_id,
      v_entitlement_id, v_request.id, 'leave_approved', -v_request.quantity,
      v_request.start_date, 'Approved leave',
      jsonb_build_object('approved_by', v_user_id), v_user_id
    );
  else
    v_new_status := 'declined';
  end if;

  update public.leave_requests
  set status = v_new_status, decided_at = now(), decided_by = v_user_id, updated_at = now()
  where id = v_request.id;

  insert into public.approval_actions(
    organisation_id, request_id, actor_user_id, action, note
  )
  values (
    v_request.organisation_id, v_request.id, v_user_id,
    case when v_new_status = 'approved' then 'approved'::public.approval_action_type
         else 'declined'::public.approval_action_type end,
    nullif(btrim(p_note), '')
  );

  insert into public.audit_events(
    organisation_id, actor_user_id, entity_type, entity_id, event_type, payload
  )
  values (
    v_request.organisation_id, v_user_id, 'leave_request', v_request.id,
    case when v_new_status = 'approved' then 'leave.request.approved'
         else 'leave.request.declined' end,
    jsonb_build_object('quantity', v_request.quantity)
  );

  return v_new_status;
end;
$$;

revoke execute on function public.decide_leave_request(uuid,text,text) from anon;
revoke execute on function public.decide_leave_request(uuid,text,text) from public;
grant execute on function public.decide_leave_request(uuid,text,text) to authenticated;
