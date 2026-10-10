import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const org = "00000000-0000-0000-0000-000000000001", otherOrg = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000011", hr = "00000000-0000-0000-0000-000000000012", employee = "00000000-0000-0000-0000-000000000013", invited = "00000000-0000-0000-0000-000000000014";
const employeeId = "00000000-0000-0000-0000-000000000031", adminEmployeeId = "00000000-0000-0000-0000-000000000032", otherEmployeeId = "00000000-0000-0000-0000-000000000033";
async function fixture(db) {
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create schema private; create schema extensions;
    create extension pgcrypto with schema extensions;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create type public.member_role as enum('employee','manager','hr_admin','org_admin','reporter','auditor');
    create table public.organisations(id uuid primary key,name text);
    create table public.organisation_memberships(id uuid default gen_random_uuid(),organisation_id uuid,user_id uuid,role public.member_role,is_active boolean default true,created_at timestamptz default now(),unique(organisation_id,user_id,role));
    create table public.employees(id uuid primary key default gen_random_uuid(),organisation_id uuid,user_id uuid,employee_number text,first_name text,last_name text,email text,start_date date,department_id uuid,manager_employee_id uuid,employment_status text default 'active',updated_at timestamptz);
    create table public.employee_invitations(id uuid primary key default gen_random_uuid(),organisation_id uuid,employee_id uuid,email text,first_name text,last_name text,employee_number text,department_id uuid,manager_employee_id uuid,work_schedule_id uuid,start_date date,grant_manager_role boolean default false,token_hash bytea,expires_at timestamptz default now()+interval '7 days',accepted_at timestamptz,created_by uuid);
    create table public.audit_events(id uuid default gen_random_uuid(),organisation_id uuid,actor_user_id uuid,entity_type text,entity_id uuid,event_type text,payload jsonb);
    create table public.departments(id uuid,organisation_id uuid);
    create table public.work_schedules(id uuid primary key default gen_random_uuid(),organisation_id uuid,created_at timestamptz default now());
    create table public.employee_schedule_assignments(organisation_id uuid,employee_id uuid,work_schedule_id uuid,effective_from date,effective_to date);
    create view public.employee_current_conditions as select id as employee_id,manager_employee_id from public.employees;
    create function private.is_verified_email_identity(p_uid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from auth.users where id=p_uid and email_confirmed_at is not null)$$;
    create function private.has_org_role(org_id uuid,allowed_roles public.member_role[]) returns boolean language sql stable security definer set search_path='' as $$select private.is_verified_email_identity(auth.uid()) and exists(select 1 from public.organisation_memberships where organisation_id=org_id and user_id=auth.uid() and is_active and role=any(allowed_roles))$$;
    -- Entitlement provisioning is outside this test's access boundary.
    create function private.provision_employee_entitlements(uuid,uuid,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
    grant usage on schema auth to authenticated;
    insert into auth.users values('${admin}','admin@example.test',now()),('${hr}','hr@example.test',now()),('${employee}','employee@example.test',now()),('${invited}','invited@example.test',now());
    insert into public.organisations values('${org}','Test organisation'),('${otherOrg}','Other organisation');
    insert into public.organisation_memberships(organisation_id,user_id,role) values('${org}','${admin}','org_admin'),('${org}','${hr}','hr_admin'),('${org}','${employee}','employee');
    insert into public.employees(id,organisation_id,user_id,email,start_date) values('${employeeId}','${org}','${employee}','employee@example.test',current_date),('${adminEmployeeId}','${org}','${admin}','admin@example.test',current_date),('${otherEmployeeId}','${otherOrg}',null,'other@example.test',current_date);
    insert into public.work_schedules(organisation_id) values('${org}');`);
  const nativeAdd = await readFile('supabase/migrations/20260925144223_za_holidays_and_employee_entitlement_provisioning.sql','utf8');
  await db.exec(nativeAdd.slice(nativeAdd.indexOf('create or replace function public.add_employee_record('),nativeAdd.indexOf('create or replace function public.bootstrap_organisation(')));
  const nativePrepare = await readFile('supabase/migrations/20260925134852_separate_employee_records_from_access_invites.sql','utf8');
  await db.exec(nativePrepare.slice(nativePrepare.indexOf('create or replace function public.prepare_employee_access_invitation('),nativePrepare.indexOf('create or replace function public.claim_employee_invitation(')));
  await db.exec(await readFile('supabase/migrations/20261010103543_role_discovery_and_governed_assignment.sql','utf8'));
}

test("trusted role assignment enforces authority, tenant, freshness and invitation identity", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  t.after(() => db.close()); await fixture(db);
  const actor = async (id) => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  const value = async (sql,args=[]) => Object.values((await db.query(sql,args)).rows[0] ?? {})[0];
  const setRoles = (id, roles, before) => value('select public.set_employee_access_roles($1,$2,$3,$4)',[id,'{'+roles.join(',')+'}','{'+before.join(',')+'}','Fixture role change']);
  const add = (roles, overrides={}) => value('select public.add_employee_with_access_roles($1,$2,$3,current_date,$4,p_prepare_invitation:=$5,p_existing_employee_id:=$6)',[overrides.email ?? 'invited@example.test','Invited','Person','{'+roles.join(',')+'}',overrides.prepare ?? true,overrides.id ?? null]);
  await t.test("ordinary roles and HR cannot grant privileged access",async () => {
    await actor(employee); await assert.rejects(setRoles(employeeId,['employee','org_admin'],['employee']),/not_authorised/);
    await actor(hr); await assert.rejects(setRoles(employeeId,['employee','auditor'],['employee']),/not_authorised/);
    await assert.rejects(add(['employee','hr_admin']),/organisation_admin_required/);
    await db.exec(`insert into public.organisation_memberships(organisation_id,user_id,role) values('${org}','${employee}','manager')`);
    await actor(employee); await assert.rejects(setRoles(employeeId,['employee','org_admin'],['employee','manager']),/not_authorised/);
  });
  await t.test("administrator edits preserve employee access and reject stale, cross-tenant or self edits", async () => {
    await actor(admin);
    await assert.rejects(setRoles(otherEmployeeId,['employee','auditor'],['employee']),/not_authorised/);
    await assert.rejects(setRoles(adminEmployeeId,['employee'],['org_admin']),/self_role_change_not_allowed/);
    await assert.rejects(setRoles(employeeId,['auditor'],['employee','manager']),/invalid_role_assignment/);
    await assert.rejects(setRoles(employeeId,['employee','auditor'],['employee']),/roles_changed_refresh_required/);
    await setRoles(employeeId,['employee','manager','auditor'],['employee','manager']);
    assert.deepEqual(await value(`select array_agg(role::text order by role) from public.organisation_memberships where user_id='${employee}' and is_active`),['employee','manager','auditor']);
    assert.equal(await value("select count(*)::int from public.audit_events where event_type='employee.access_roles.changed'"),1);
    await db.exec(`update auth.users set email_confirmed_at=null where id='${admin}'`);
    await assert.rejects(setRoles(employeeId,['employee'],['employee','manager','auditor']),/email_verification_required/);
    await db.exec(`update auth.users set email_confirmed_at=now() where id='${admin}'`);
  });
  let invitation;
  await t.test("creation saves every trusted invitation role atomically and prevents accidental role loss", async () => {
    await actor(admin); invitation=await add(['employee','hr_admin','reporter','auditor']);
    const roles = await value('select assigned_roles::text[] from public.employee_invitations where employee_id=$1',[invitation.employee_id]);
    assert.deepEqual(roles,['employee','hr_admin','reporter','auditor']);
    await setRoles(invitation.employee_id,['employee','manager','org_admin','reporter','auditor'],roles);
    await assert.rejects(add(['employee'],{id:invitation.employee_id}),/invitation_already_pending/);
    await assert.rejects(add(['employee','reporter'],{email:'no-access@example.test',prepare:false}),/invitation_required_for_roles/);
    assert.equal(await value("select count(*)::int from public.employees where email='no-access@example.test'"),0);
  });
  await t.test("legacy invitation recovery preserves administrator-approved pending roles",async () => {
    await actor(hr);
    const token = await value('select public.prepare_employee_access_invitation($1,false)',[invitation.employee_id]);
    const roles = await value('select assigned_roles::text[] from public.employee_invitations where employee_id=$1 and accepted_at is null and expires_at>now()',[invitation.employee_id]);
    assert.deepEqual(roles,['employee','manager','org_admin','reporter','auditor']);
    invitation.invitation_token=token;
  });
  await t.test("invitation summary and claim disclose and grant only trusted roles to the verified invited identity",async () => {
    await actor(employee);
    assert.equal((await db.query('select organisation_name,assigned_roles::text[] as assigned_roles from public.get_my_invitation_context($1)',[invitation.invitation_token])).rows.length,0);
    await assert.rejects(value('select public.claim_employee_invitation($1)',[invitation.invitation_token]),/invitation_invalid_or_expired/);
    await actor(invited);
    const context=(await db.query('select organisation_name,assigned_roles::text[] as assigned_roles from public.get_my_invitation_context($1)',[invitation.invitation_token])).rows[0];
    assert.equal(context.organisation_name,'Test organisation');
    assert.deepEqual(context.assigned_roles,['employee','manager','org_admin','reporter','auditor']);
    assert.equal(await value('select public.claim_employee_invitation($1)',[invitation.invitation_token]),invitation.employee_id);
    assert.deepEqual(await value(`select array_agg(role::text order by role) from public.organisation_memberships where user_id='${invited}' and is_active`),context.assigned_roles);
    await assert.rejects(value('select public.claim_employee_invitation($1)',[invitation.invitation_token]),/invitation_invalid_or_expired/);
  });
  await t.test("anonymous execution and missing identity are denied",async () => {
    const privileges=await value("select bool_and(not has_function_privilege('anon',p.oid,'EXECUTE')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef");
    assert.equal(privileges,true); await actor('');
    await assert.rejects(setRoles(employeeId,['employee'],['employee','manager','auditor']),/authentication_required/);
    await assert.rejects(add(['employee']),/authentication_required/);
    await assert.rejects(value('select organisation_name,assigned_roles::text[] as assigned_roles from public.get_my_invitation_context($1)',['token']),/authentication_required/);
  });
});
