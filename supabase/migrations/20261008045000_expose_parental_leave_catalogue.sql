-- Reconstruct leave-type governance columns that exist in production but pre-date
-- the complete committed migration chain. The ALTERs are idempotent on production
-- and make a zero-state replay reproduce the live leave_types contract.
alter table public.leave_types
  add column if not exists description text,
  add column if not exists category text not null default 'employer_policy',
  add column if not exists statutory_status text not null default 'non_statutory',
  add column if not exists system_defined boolean not null default false,
  add column if not exists protected_system_type boolean not null default false,
  add column if not exists employee_visible boolean not null default true,
  add column if not exists manager_visible boolean not null default true,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.leave_types'::regclass
      and conname='leave_types_category_check'
  ) then
    alter table public.leave_types
      add constraint leave_types_category_check
      check (category in ('statutory','parental','employer_policy','time_off_ledger'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.leave_types'::regclass
      and conname='leave_types_statutory_status_check'
  ) then
    alter table public.leave_types
      add constraint leave_types_statutory_status_check
      check (statutory_status in ('statutory','legally_recognised_interim','non_statutory'));
  end if;
end
$$;

-- Active statutory parental categories belong in the employee catalogue.
-- Event-based categories remain protected by the existing request guard;
-- manual-allocation parental leave remains unusable until HR records the
-- applicable entitlement.
update public.leave_types
set employee_visible = true,
    updated_at = now()
where active = true
  and is_statutory = true
  and category = 'parental'
  and code in ('MATERNITY','PARENTAL','ADOPTION','COMMISSIONING_PARENTAL');
