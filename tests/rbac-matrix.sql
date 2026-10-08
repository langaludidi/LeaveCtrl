\set ON_ERROR_STOP on

\echo 'Setting up synthetic V1 RBAC matrix fixtures'

create schema if not exists rbac_test;
grant usage on schema rbac_test to authenticated;

create or replace function rbac_test.expect_error(p_sql text, p_expected text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_message text;
begin
  begin
    execute p_sql;
    raise exception 'rbac_expected_error_missing:%', p_expected;
  exception when others then
    v_message := sqlerrm;
    if v_message like 'rbac_expected_error_missing:%' then
      raise;
    end if;
    if position(p_expected in v_message)=0 then
      raise exception 'rbac_unexpected_error: expected %, got %', p_expected, v_message;
    end if;
  end;
end
$$;
grant execute on function rbac_test.expect_error(text,text) to authenticated;

-- Synthetic confirmed identities. These exist only in the disposable local CI database.
insert into auth.users(
  id,aud,role,email,email_confirmed_at,confirmation_sent_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('00000000-0000-0000-0000-000000000101','authenticated','authenticated','employee-a@example.test',now(),now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000102','authenticated','authenticated','manager-a@example.test',now(),now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000103','authenticated','authenticated','report-a@example.test',now(),now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000104','authenticated','authenticated','other-a@example.test',now(),now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000105','authenticated','authenticated','hr-a@example.test',now(),now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000106','authenticated','authenticated','admin-a@example.test',now(),now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000107','authenticated','authenticated','reporter-a@example.test',now(),now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000108','authenticated','authenticated','auditor-a@example.test',now(),now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000201','authenticated','authenticated','employee-b@example.test',now(),now(),'{}','{}',now(),now());

insert into public.organisations(id,name)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','RBAC Organisation A'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','RBAC Organisation B');

insert into public.organisation_memberships(organisation_id,user_id,role,is_active)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000101','employee',true),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000102','manager',true),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000103','employee',true),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000104','employee',true),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000105','hr_admin',true),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000106','org_admin',true),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000107','reporter',true),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000108','auditor',true),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','00000000-0000-0000-0000-000000000201','employee',true);

insert into public.work_schedules(id,organisation_id,name)
values
('00000000-0000-0000-0000-000000000501','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','RBAC Schedule A'),
('00000000-0000-0000-0000-000000000502','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','RBAC Schedule B');

insert into public.employees(
  id,organisation_id,user_id,employee_number,first_name,last_name,email,start_date,employment_status
) values
('00000000-0000-0000-0000-000000000301','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000101','A-EMP','Employee','A','employee-a@example.test',current_date-100,'active'),
('00000000-0000-0000-0000-000000000302','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000102','A-MGR','Manager','A','manager-a@example.test',current_date-100,'active'),
('00000000-0000-0000-0000-000000000303','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000103','A-RPT','Managed','Report','report-a@example.test',current_date-100,'active'),
('00000000-0000-0000-0000-000000000304','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000104','A-OTH','Other','A','other-a@example.test',current_date-100,'active'),
('00000000-0000-0000-0000-000000000305','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000105','A-HR','HR','Admin','hr-a@example.test',current_date-100,'active'),
('00000000-0000-0000-0000-000000000306','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000106','A-ADM','Org','Admin','admin-a@example.test',current_date-100,'active'),
('00000000-0000-0000-0000-000000000307','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000107','A-REP','Reporter','A','reporter-a@example.test',current_date-100,'active'),
('00000000-0000-0000-0000-000000000308','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000108','A-AUD','Auditor','A','auditor-a@example.test',current_date-100,'active'),
('00000000-0000-0000-0000-000000000401','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','00000000-0000-0000-0000-000000000201','B-EMP','Employee','B','employee-b@example.test',current_date-100,'active');

-- Use the current effective-condition path that private.manages_employee uses.
insert into public.employee_employment_conditions(
  id,organisation_id,employee_id,manager_employee_id,work_schedule_id,effective_from,change_type
) values (
  '00000000-0000-0000-0000-000000000901',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '00000000-0000-0000-0000-000000000303',
  '00000000-0000-0000-0000-000000000302',
  '00000000-0000-0000-0000-000000000501',
  current_date-30,
  'manager_change'
);

insert into public.leave_types(id,organisation_id,code,name)
values
('00000000-0000-0000-0000-000000000601','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','RBAC_A','RBAC Leave A'),
('00000000-0000-0000-0000-000000000602','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','RBAC_B','RBAC Leave B');

insert into public.leave_requests(
 id,organisation_id,employee_id,leave_type_id,start_date,end_date,quantity,status,submitted_at
) values
('00000000-0000-0000-0000-000000000701','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000601',current_date+10,current_date+10,1,'pending_approval',now()),
('00000000-0000-0000-0000-000000000702','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000601',current_date+11,current_date+11,1,'pending_approval',now()),
('00000000-0000-0000-0000-000000000703','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-000000000601',current_date+12,current_date+12,1,'pending_approval',now()),
('00000000-0000-0000-0000-000000000704','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000304','00000000-0000-0000-0000-000000000601',current_date+13,current_date+13,1,'pending_approval',now()),
('00000000-0000-0000-0000-000000000705','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000305','00000000-0000-0000-0000-000000000601',current_date+14,current_date+14,1,'pending_approval',now()),
('00000000-0000-0000-0000-000000000706','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000306','00000000-0000-0000-0000-000000000601',current_date+15,current_date+15,1,'pending_approval',now()),
('00000000-0000-0000-0000-000000000707','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000307','00000000-0000-0000-0000-000000000601',current_date+16,current_date+16,1,'pending_approval',now()),
('00000000-0000-0000-0000-000000000708','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','00000000-0000-0000-0000-000000000308','00000000-0000-0000-0000-000000000601',current_date+17,current_date+17,1,'pending_approval',now()),
('00000000-0000-0000-0000-000000000801','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000602',current_date+10,current_date+10,1,'pending_approval',now());

-- The authenticated Data API role must not have generic public-table mutation rights.
select (
  not has_table_privilege('authenticated','public.departments','INSERT')
  and not has_table_privilege('authenticated','public.leave_requests','UPDATE')
  and not has_table_privilege('authenticated','public.leave_events','INSERT')
  and not has_table_privilege('authenticated','public.leave_evidence','INSERT')
  and not has_table_privilege('authenticated','public.absence_types','INSERT')
  and not has_table_privilege('authenticated','public.absence_events','INSERT')
) as ok \gset
\if :ok
\else
  \echo 'FAIL: generic authenticated mutation privileges are open'
  \quit 1
\endif

-- Employee: own data only.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',false);
set role authenticated;
select (
  (select count(*) from public.employees)=1
  and (select count(*) from public.leave_requests)=1
  and (select count(*) from public.organisation_memberships)=1
  and (select count(*) from public.leave_requests where organisation_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')=0
) as ok \gset
\if :ok
\else
  \echo 'FAIL: employee self/cross-tenant visibility'
  \quit 1
\endif
select rbac_test.expect_error(
  $$select public.decide_leave_request('00000000-0000-0000-0000-000000000701','approve',null)$$,
  'self_approval_not_allowed'
);
reset role;

-- Manager: self plus actual managed report, not other organisation staff.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',false);
set role authenticated;
select (
  (select count(*) from public.employees)=2
  and (select count(*) from public.leave_requests)=2
  and (select count(*) from public.leave_requests where id='00000000-0000-0000-0000-000000000703')=1
  and (select count(*) from public.leave_requests where id='00000000-0000-0000-0000-000000000704')=0
  and (select count(*) from public.organisation_memberships)=1
  and (select count(*) from public.leave_requests where organisation_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')=0
) as ok \gset
\if :ok
\else
  \echo 'FAIL: manager managed-only visibility'
  \quit 1
\endif
select rbac_test.expect_error(
  $$select public.create_department('Manager forbidden','MGRX')$$,
  'not_authorised'
);
select public.decide_leave_request(
  '00000000-0000-0000-0000-000000000703','approve',null
);
reset role;

-- HR Admin: organisation-wide governed read and administrative RPC.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000105',false);
set role authenticated;
select (
  (select count(*) from public.employees)=8
  and (select count(*) from public.leave_requests)=8
  and (select count(*) from public.organisation_memberships)=8
  and (select count(*) from public.leave_requests where organisation_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')=0
) as ok \gset
\if :ok
\else
  \echo 'FAIL: HR Admin organisation visibility'
  \quit 1
\endif
select public.create_department('HR permitted','HRT');
reset role;

-- Org Admin: organisation-wide governed read/admin, never cross-tenant.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000106',false);
set role authenticated;
select (
  (select count(*) from public.employees)=8
  and (select count(*) from public.leave_requests)=8
  and (select count(*) from public.organisation_memberships)=8
  and (select count(*) from public.leave_requests where organisation_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')=0
) as ok \gset
\if :ok
\else
  \echo 'FAIL: Org Admin organisation/cross-tenant visibility'
  \quit 1
\endif
select public.create_department('Admin permitted','ADMT');
select rbac_test.expect_error(
  $select public.get_billing_summary_v1('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')$,
  'billing_access_denied'
);
select rbac_test.expect_error(
  $select * from public.billing_operations_v1()$,
  'billing_operator_required'
);
select rbac_test.expect_error(
  $select public.record_billing_operator_reconciliation_v1('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','synthetic-ref')$,
  'billing_operator_required'
);
reset role;

-- Reporter: organisation-wide workforce/leave read, but own membership only and no mutations.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000107',false);
set role authenticated;
select (
  (select count(*) from public.employees)=8
  and (select count(*) from public.leave_requests)=8
  and (select count(*) from public.organisation_memberships)=1
  and (select count(*) from public.leave_requests where organisation_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')=0
) as ok \gset
\if :ok
\else
  \echo 'FAIL: Reporter governed read scope'
  \quit 1
\endif
select rbac_test.expect_error(
  $$select public.create_department('Reporter forbidden','REPX')$$,
  'not_authorised'
);
select rbac_test.expect_error(
  $$select public.decide_leave_request('00000000-0000-0000-0000-000000000704','approve',null)$$,
  'not_authorised'
);
reset role;

-- Auditor: organisation-wide governed read including memberships, but no operational writes.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000108',false);
set role authenticated;
select (
  (select count(*) from public.employees)=8
  and (select count(*) from public.leave_requests)=8
  and (select count(*) from public.organisation_memberships)=8
  and (select count(*) from public.leave_requests where organisation_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1')=0
) as ok \gset
\if :ok
\else
  \echo 'FAIL: Auditor governed read scope'
  \quit 1
\endif
select rbac_test.expect_error(
  $$select public.create_department('Auditor forbidden','AUDX')$$,
  'not_authorised'
);
select rbac_test.expect_error(
  $$select public.decide_leave_request('00000000-0000-0000-0000-000000000704','approve',null)$$,
  'not_authorised'
);
reset role;

-- Independent second tenant remains isolated.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000201',false);
set role authenticated;
select (
  (select count(*) from public.employees)=1
  and (select count(*) from public.leave_requests)=1
  and (select count(*) from public.organisation_memberships)=1
  and (select count(*) from public.leave_requests where organisation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')=0
) as ok \gset
\if :ok
\else
  \echo 'FAIL: second-tenant isolation'
  \quit 1
\endif
reset role;

drop schema rbac_test cascade;
\echo 'PASS: six-role synthetic RBAC and tenant-isolation matrix'
