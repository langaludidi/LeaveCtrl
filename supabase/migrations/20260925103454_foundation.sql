-- LeaveCtrl foundation schema
-- South Africa-first, multi-tenant, ledger-backed leave management.

create extension if not exists pgcrypto;

create schema if not exists private;

create type public.member_role as enum ('employee','manager','hr_admin','org_admin','reporter','auditor');
create type public.employment_status as enum ('active','exited','suspended');
create type public.leave_request_status as enum (
  'draft','submitted','pending_approval','approved','declined','withdrawn',
  'cancellation_requested','cancelled'
);
create type public.ledger_entry_type as enum (
  'entitlement_granted','accrual','carry_over','carry_over_expired',
  'leave_reserved','leave_approved','leave_reversed','manual_adjustment',
  'toil_earned','toil_used','migration_opening_balance'
);
create type public.approval_action_type as enum ('submitted','approved','declined','withdrawn','cancel_requested','cancel_approved');

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text not null default 'ZA',
  timezone text not null default 'Africa/Johannesburg',
  currency_code text not null default 'ZAR',
  leave_year_start_month smallint not null default 1 check (leave_year_start_month between 1 and 12),
  status text not null default 'trial' check (status in ('trial','active','past_due','suspended','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, user_id, role)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  code text,
  manager_employee_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  employee_number text,
  first_name text not null,
  last_name text not null,
  email text not null,
  start_date date not null,
  end_date date,
  department_id uuid references public.departments(id) on delete set null,
  manager_employee_id uuid references public.employees(id) on delete set null,
  employment_status public.employment_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, employee_number),
  unique (organisation_id, email),
  check (end_date is null or end_date >= start_date)
);

alter table public.departments
  add constraint departments_manager_employee_fk
  foreign key (manager_employee_id) references public.employees(id) on delete set null;

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  monday_hours numeric(5,2) not null default 8,
  tuesday_hours numeric(5,2) not null default 8,
  wednesday_hours numeric(5,2) not null default 8,
  thursday_hours numeric(5,2) not null default 8,
  friday_hours numeric(5,2) not null default 8,
  saturday_hours numeric(5,2) not null default 0,
  sunday_hours numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table public.employee_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_schedule_id uuid not null references public.work_schedules(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  code text not null,
  name text not null,
  unit text not null default 'days' check (unit in ('days','hours')),
  is_statutory boolean not null default false,
  requires_approval boolean not null default true,
  requires_evidence boolean not null default false,
  colour_token text not null default 'teal',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organisation_id, code)
);

create table public.leave_policy_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  version integer not null,
  effective_from date not null,
  effective_to date,
  entitlement_method text not null,
  entitlement_amount numeric(10,2),
  cycle_months integer,
  carry_over_cap numeric(10,2),
  carry_over_expiry_date_rule text,
  negative_balance_allowed boolean not null default false,
  evidence_rule jsonb not null default '{}'::jsonb,
  approval_rule jsonb not null default '{}'::jsonb,
  statutory_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organisation_id, leave_type_id, version),
  check (effective_to is null or effective_to >= effective_from)
);

create table public.leave_entitlements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  policy_version_id uuid references public.leave_policy_versions(id) on delete restrict,
  cycle_start date not null,
  cycle_end date not null,
  opening_entitlement numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, cycle_start),
  check (cycle_end >= cycle_start)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  policy_version_id uuid references public.leave_policy_versions(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  quantity numeric(10,2) not null check (quantity >= 0),
  status public.leave_request_status not null default 'draft',
  note text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.leave_request_days (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  request_id uuid not null references public.leave_requests(id) on delete cascade,
  leave_date date not null,
  scheduled_hours numeric(5,2) not null default 0,
  chargeable_quantity numeric(10,2) not null default 0,
  exclusion_reason text,
  unique (request_id, leave_date)
);

create table public.leave_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  entitlement_id uuid references public.leave_entitlements(id) on delete restrict,
  request_id uuid references public.leave_requests(id) on delete restrict,
  entry_type public.ledger_entry_type not null,
  quantity numeric(10,2) not null,
  effective_date date not null,
  reason text,
  source_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  request_id uuid not null references public.leave_requests(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action public.approval_action_type not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index memberships_user_idx on public.organisation_memberships(user_id, organisation_id) where is_active;
create index employees_org_idx on public.employees(organisation_id);
create index employees_user_idx on public.employees(user_id);
create index requests_org_employee_idx on public.leave_requests(organisation_id, employee_id, start_date desc);
create index requests_status_idx on public.leave_requests(organisation_id, status);
create index ledger_balance_idx on public.leave_ledger_entries(organisation_id, employee_id, leave_type_id, effective_date);
create index audit_org_time_idx on public.audit_events(organisation_id, created_at desc);

create or replace function private.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = org_id
      and m.user_id = auth.uid()
      and m.is_active
  )
$$;

create or replace function private.has_org_role(org_id uuid, allowed_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id = org_id
      and m.user_id = auth.uid()
      and m.is_active
      and m.role = any(allowed_roles)
  )
$$;

create or replace function private.is_self_employee(employee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where e.id = employee
      and e.user_id = auth.uid()
  )
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.member_role[]) to authenticated;
grant execute on function private.is_self_employee(uuid) to authenticated;

alter table public.organisations enable row level security;
alter table public.organisation_memberships enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.work_schedules enable row level security;
alter table public.employee_schedule_assignments enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_policy_versions enable row level security;
alter table public.leave_entitlements enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_request_days enable row level security;
alter table public.leave_ledger_entries enable row level security;
alter table public.approval_actions enable row level security;
alter table public.audit_events enable row level security;

create policy organisations_read on public.organisations
for select using (private.is_org_member(id));

create policy organisations_admin_update on public.organisations
for update using (private.has_org_role(id, array['org_admin'::public.member_role,'hr_admin'::public.member_role]))
with check (private.has_org_role(id, array['org_admin'::public.member_role,'hr_admin'::public.member_role]));

create policy memberships_read on public.organisation_memberships
for select using (private.is_org_member(organisation_id));

create policy departments_read on public.departments
for select using (private.is_org_member(organisation_id));

create policy employees_read on public.employees
for select using (private.is_org_member(organisation_id));

create policy schedules_read on public.work_schedules
for select using (private.is_org_member(organisation_id));

create policy schedule_assignments_read on public.employee_schedule_assignments
for select using (private.is_org_member(organisation_id));

create policy leave_types_read on public.leave_types
for select using (private.is_org_member(organisation_id));

create policy policy_versions_read on public.leave_policy_versions
for select using (private.is_org_member(organisation_id));

create policy entitlements_read on public.leave_entitlements
for select using (
  private.is_self_employee(employee_id)
  or private.has_org_role(organisation_id, array['manager'::public.member_role,'hr_admin'::public.member_role,'org_admin'::public.member_role,'reporter'::public.member_role,'auditor'::public.member_role])
);

create policy leave_requests_read on public.leave_requests
for select using (
  private.is_self_employee(employee_id)
  or private.has_org_role(organisation_id, array['manager'::public.member_role,'hr_admin'::public.member_role,'org_admin'::public.member_role,'reporter'::public.member_role,'auditor'::public.member_role])
);

create policy leave_requests_employee_insert on public.leave_requests
for insert with check (
  private.is_self_employee(employee_id)
  and private.is_org_member(organisation_id)
);

create policy leave_requests_employee_update_own_draft on public.leave_requests
for update using (
  private.is_self_employee(employee_id)
  and status in ('draft','submitted','pending_approval')
) with check (
  private.is_self_employee(employee_id)
);

create policy request_days_read on public.leave_request_days
for select using (
  exists (
    select 1 from public.leave_requests r
    where r.id = request_id
      and (
        private.is_self_employee(r.employee_id)
        or private.has_org_role(r.organisation_id, array['manager'::public.member_role,'hr_admin'::public.member_role,'org_admin'::public.member_role,'reporter'::public.member_role,'auditor'::public.member_role])
      )
  )
);

create policy ledger_read on public.leave_ledger_entries
for select using (
  private.is_self_employee(employee_id)
  or private.has_org_role(organisation_id, array['manager'::public.member_role,'hr_admin'::public.member_role,'org_admin'::public.member_role,'reporter'::public.member_role,'auditor'::public.member_role])
);

create policy approvals_read on public.approval_actions
for select using (private.is_org_member(organisation_id));

create policy audit_admin_read on public.audit_events
for select using (
  private.has_org_role(organisation_id, array['hr_admin'::public.member_role,'org_admin'::public.member_role,'auditor'::public.member_role])
);

comment on table public.leave_ledger_entries is 'Immutable leave balance history. Corrections must be compensating entries, never destructive balance edits.';
comment on table public.leave_policy_versions is 'Effective-dated employer/statutory policy rules. Historical requests retain their original policy_version_id.';
