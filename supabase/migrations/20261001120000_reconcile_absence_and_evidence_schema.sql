-- Reconcile production schema objects that pre-dated the verified billing migration
-- but were not represented in repository migration history.
-- Idempotent by design so it is safe to record against the existing production schema.

create table if not exists public.absence_types (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  category text not null default 'absence',
  paid_status text not null default 'policy_defined'
    check (paid_status in ('paid','unpaid','partially_paid','policy_defined')),
  employee_requestable boolean not null default false,
  payroll_effect text not null default 'none',
  requires_evidence boolean not null default false,
  confidentiality_level text not null default 'standard'
    check (confidentiality_level in ('standard','restricted','highly_restricted')),
  system_defined boolean not null default true,
  active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, code)
);

create table if not exists public.absence_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  absence_type_id uuid not null references public.absence_types(id),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  scheduled_quantity numeric,
  unit text not null default 'days' check (unit in ('days','hours')),
  status text not null default 'recorded'
    check (status in ('recorded','confirmed','cancelled')),
  incident_date date,
  external_reference text,
  payroll_impact boolean not null default false,
  note text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leave_evidence (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_request_id uuid references public.leave_requests(id) on delete cascade,
  leave_event_id uuid references public.leave_events(id) on delete cascade,
  evidence_kind text not null,
  storage_path text,
  file_name text,
  mime_type text,
  received_at timestamptz not null default now(),
  access_roles public.member_role[] not null
    default array['hr_admin'::public.member_role,'org_admin'::public.member_role],
  created_by uuid,
  created_at timestamptz not null default now(),
  check (leave_request_id is not null or leave_event_id is not null)
);

create index if not exists absence_events_absence_type_idx
  on public.absence_events(absence_type_id);
create index if not exists absence_events_employee_dates_idx
  on public.absence_events(employee_id,start_date,end_date);
create index if not exists absence_events_org_dates_idx
  on public.absence_events(organisation_id,start_date,end_date);

create index if not exists leave_evidence_employee_idx
  on public.leave_evidence(employee_id);
create index if not exists leave_evidence_event_idx
  on public.leave_evidence(leave_event_id);
create index if not exists leave_evidence_org_idx
  on public.leave_evidence(organisation_id);
create index if not exists leave_evidence_request_idx
  on public.leave_evidence(leave_request_id);

alter table public.absence_types enable row level security;
alter table public.absence_events enable row level security;
alter table public.leave_evidence enable row level security;

drop policy if exists absence_types_read on public.absence_types;
create policy absence_types_read on public.absence_types
for select to authenticated
using (private.is_org_member(organisation_id));

drop policy if exists absence_types_insert on public.absence_types;
create policy absence_types_insert on public.absence_types
for insert to authenticated
with check (private.has_org_role(
  organisation_id,
  array['hr_admin'::public.member_role,'org_admin'::public.member_role]
));

drop policy if exists absence_types_update on public.absence_types;
create policy absence_types_update on public.absence_types
for update to authenticated
using (private.has_org_role(
  organisation_id,
  array['hr_admin'::public.member_role,'org_admin'::public.member_role]
))
with check (private.has_org_role(
  organisation_id,
  array['hr_admin'::public.member_role,'org_admin'::public.member_role]
));

drop policy if exists absence_types_delete on public.absence_types;
create policy absence_types_delete on public.absence_types
for delete to authenticated
using (private.has_org_role(
  organisation_id,
  array['hr_admin'::public.member_role,'org_admin'::public.member_role]
));

drop policy if exists absence_events_read on public.absence_events;
create policy absence_events_read on public.absence_events
for select to authenticated
using (
  private.is_self_employee(employee_id)
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

drop policy if exists absence_events_insert on public.absence_events;
create policy absence_events_insert on public.absence_events
for insert to authenticated
with check (
  private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role]
  )
);

drop policy if exists absence_events_update on public.absence_events;
create policy absence_events_update on public.absence_events
for update to authenticated
using (
  private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role]
  )
)
with check (
  private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role]
  )
);

drop policy if exists absence_events_delete on public.absence_events;
create policy absence_events_delete on public.absence_events
for delete to authenticated
using (
  private.manages_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role]
  )
);

drop policy if exists leave_evidence_read on public.leave_evidence;
create policy leave_evidence_read on public.leave_evidence
for select to authenticated
using (
  private.is_self_employee(employee_id)
  or private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role]
  )
);

drop policy if exists leave_evidence_insert on public.leave_evidence;
create policy leave_evidence_insert on public.leave_evidence
for insert to authenticated
with check (
  (
    private.is_self_employee(employee_id)
    and exists (
      select 1
      from public.employees e
      where e.id=employee_id
        and e.organisation_id=organisation_id
    )
  )
  or private.has_org_role(
    organisation_id,
    array['hr_admin'::public.member_role,'org_admin'::public.member_role]
  )
);

-- Match the current production grant model: authenticated reads through RLS;
-- writes remain behind governed server/RPC paths.
revoke all on public.absence_types from anon, authenticated;
revoke all on public.absence_events from anon, authenticated;
revoke all on public.leave_evidence from anon, authenticated;
grant select on public.absence_types to authenticated;
grant select on public.absence_events to authenticated;
grant select on public.leave_evidence to authenticated;
grant all on public.absence_types to service_role;
grant all on public.absence_events to service_role;
grant all on public.leave_evidence to service_role;
