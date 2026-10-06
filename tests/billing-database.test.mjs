import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const org1 = "00000000-0000-0000-0000-000000000001",
  org2 = "00000000-0000-0000-0000-000000000002";
const admin = "00000000-0000-0000-0000-000000000011",
  employee = "00000000-0000-0000-0000-000000000012";
const tables = [
  "departments",
  "work_schedules",
  "employee_schedule_assignments",
  "leave_types",
  "leave_policy_versions",
  "leave_entitlements",
  "leave_requests",
  "leave_request_days",
  "leave_ledger_entries",
  "approval_actions",
  "blocked_periods",
  "coverage_rules",
  "locations",
  "employee_employment_conditions",
  "employee_remuneration_history",
  "overtime_settings",
  "overtime_events",
  "employee_variable_earnings",
  "toil_ledger_entries",
  "overtime_event_payments",
  "toil_requests",
  "leave_evidence",
  "absence_types",
  "absence_events",
];

async function fixture(db) {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema private;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
  create type public.member_role as enum('employee','org_admin','hr_admin','manager','auditor','reporter');
  create type public.employment_status as enum('active','exited','suspended');
  create table public.organisations(id uuid primary key,name text,created_at timestamptz not null default now());
  create table public.organisation_memberships(organisation_id uuid,user_id uuid,role public.member_role,is_active boolean default true);
  create table public.employees(id uuid primary key default gen_random_uuid(),organisation_id uuid not null,employment_status public.employment_status default 'active');
  create table public.audit_events(id uuid default gen_random_uuid(),organisation_id uuid,actor_user_id uuid,entity_type text,entity_id uuid,event_type text,payload jsonb);
  create function private.is_verified_email_identity(p_uid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from auth.users where id=p_uid and email_confirmed_at is not null)$$;
  create function private.has_org_role(org_id uuid,allowed_roles public.member_role[]) returns boolean language sql stable security definer set search_path='' as $$select private.is_verified_email_identity(auth.uid()) and exists(select 1 from public.organisation_memberships where organisation_id=org_id and user_id=auth.uid() and is_active and role=any(allowed_roles))$$;
  create function private.is_org_member(org_id uuid) returns boolean language sql stable security definer set search_path='' as $$select private.is_verified_email_identity(auth.uid()) and exists(select 1 from public.organisation_memberships where organisation_id=org_id and user_id=auth.uid() and is_active)$$;
  grant usage on schema auth,private to authenticated,service_role; grant execute on function auth.uid() to authenticated,service_role;
  grant select on public.employees to authenticated; alter table public.employees enable row level security;
  create policy employee_read on public.employees for select to authenticated using(private.is_org_member(organisation_id));
  insert into auth.users values('${admin}','owner@example.test',now()),('${employee}','employee@example.test',now());
  insert into public.organisations values('${org1}','Fixture organisation',now()),('${org2}','Other organisation',now());
  insert into public.organisation_memberships values('${org1}','${admin}','org_admin',true),('${org1}','${employee}','employee',true);`);
  for (const table of tables)
    await db.exec(
      `create table public.${table}(id uuid default gen_random_uuid(),organisation_id uuid not null);`,
    );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261006162023_verified_billing_and_subscription_access.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    admin,
  ]);
}

test("billing database enforces ownership, verified payment, time and capacity", async (t) => {
  const db = new PGlite();
  await fixture(db);
  let checkout, paymentEnd;
  const value = async (sql, args = []) => {
    const r = await db.query(sql, args);
    return Object.values(r.rows[0] ?? {})[0];
  };
  const pay = async (overrides = {}) =>
    value(
      "select public.record_billing_payment_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        overrides.reference ?? checkout.reference,
        overrides.id ?? "123",
        overrides.amount ?? 24900,
        overrides.currency ?? "ZAR",
        overrides.paidAt ?? new Date().toISOString(),
        overrides.customer ?? "CUS_owner",
        overrides.email ?? "owner@example.test",
        overrides.plan ?? "PLN_starter",
        overrides.mode ?? "live",
        overrides.subscription ?? null,
      ],
    );
  await t.test(
    "only a verified organisation admin can create its checkout",
    async () => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        employee,
      ]);
      await assert.rejects(
        value("select public.start_billing_checkout_v1($1,$2)", [
          org1,
          "starter_monthly_v1",
        ]),
        /billing_admin_required/,
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        admin,
      ]);
      await assert.rejects(
        value("select public.start_billing_checkout_v1($1,$2)", [
          org2,
          "starter_monthly_v1",
        ]),
        /billing_admin_required/,
      );
      checkout = await value("select public.start_billing_checkout_v1($1,$2)", [
        org1,
        "starter_monthly_v1",
      ]);
      assert.equal(checkout.amount, 24900);
      assert.equal(checkout.organisation_id, org1);
      assert.equal(
        (
          await value("select public.start_billing_checkout_v1($1,$2)", [
            org1,
            "starter_monthly_v1",
          ])
        ).reference,
        checkout.reference,
      );
      await assert.rejects(
        value("select public.start_billing_checkout_v1($1,$2)", [
          org1,
          "team_monthly_v1",
        ]),
        /checkout_already_pending/,
      );
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1])).state,
        "trial",
      );
      await db.query("select public.complete_billing_checkout_v1($1,$2,$3)", [
        checkout.reference,
        "PLN_starter",
        "https://checkout.paystack.com/fixture",
      ]);
    },
  );
  await t.test(
    "a browser or authenticated API caller cannot grant billing access",
    async () => {
      await db.exec("set role authenticated");
      await assert.rejects(pay(), /permission denied/);
      await assert.rejects(
        db.exec(
          `update public.billing_accounts set paid_until=now()+interval '1 year'`,
        ),
        /permission denied/,
      );
      await assert.rejects(
        db.exec(
          "insert into public.billing_payments(reference) values('forged')",
        ),
        /permission denied/,
      );
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1]))
          .can_manage,
        true,
      );
      await assert.rejects(
        value("select public.get_billing_summary_v1($1)", [org2]),
        /billing_access_denied/,
      );
      await db.exec("reset role");
    },
  );
  await t.test(
    "test charges and mismatched amounts, plans or payers cannot activate",
    async () => {
      for (const [change, error] of [
        [{ mode: "test" }, /test_payment/],
        [{ amount: 1 }, /mismatch/],
        [{ currency: "NGN" }, /mismatch/],
        [{ plan: "PLN_other" }, /mismatch/],
        [{ email: "other@example.test" }, /mismatch/],
      ])
        await assert.rejects(pay(change), error);
      assert.equal(
        await value("select count(*) from public.billing_payments"),
        0,
      );
    },
  );
  await t.test(
    "one verified payment allocates the selected features and capacity without changing roles",
    async () => {
      const applied = await pay();
      assert.equal(applied.applied, true);
      paymentEnd = applied.paid_until;
      const summary = await value("select public.get_billing_summary_v1($1)", [
        org1,
      ]);
      assert.equal(summary.plan_code, "starter");
      assert.equal(summary.employee_limit, 15);
      assert.equal(summary.state, "active");
      assert.deepEqual(summary.features, [
        "leave",
        "policy",
        "coverage",
        "reporting",
      ]);
      assert.equal(
        await value(
          "select count(*) from public.organisation_memberships where role='org_admin'",
        ),
        1,
      );
    },
  );
  await t.test(
    "duplicate callbacks and webhooks never stack paid periods",
    async () => {
      for (let i = 0; i < 3; i++) assert.equal((await pay()).applied, false);
      assert.equal(
        await value("select count(*) from public.billing_payments"),
        1,
      );
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1]))
          .paid_until,
        paymentEnd,
      );
    },
  );
  await t.test(
    "employee capacity cannot be bypassed through direct inserts or reactivation",
    async () => {
      for (let i = 0; i < 15; i++)
        await db.query(
          "insert into public.employees(organisation_id) values($1)",
          [org1],
        );
      await assert.rejects(
        db.query("insert into public.employees(organisation_id) values($1)", [
          org1,
        ]),
        /subscription_employee_limit/,
      );
      const e = await value(
        "insert into public.employees(organisation_id,employment_status) values($1,'exited') returning id",
        [org1],
      );
      await assert.rejects(
        db.query(
          "update public.employees set employment_status='active' where id=$1",
          [e],
        ),
        /subscription_employee_limit/,
      );
      await db.query(
        "insert into public.departments(organisation_id) values($1)",
        [org1],
      );
    },
  );
  await t.test(
    "subscription creation needs a prior verified payment and cannot grant time",
    async () => {
      await assert.rejects(
        value(
          "select public.record_billing_subscription_v1('SUB_fake','CUS_other','PLN_other','active',now())",
        ),
        /requires_verified_payment/,
      );
      await value(
        "select public.record_billing_subscription_v1('SUB_one','CUS_owner','PLN_starter','active',now())",
      );
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1]))
          .paid_until,
        paymentEnd,
      );
      await assert.rejects(
        value("select public.start_billing_checkout_v1($1,$2)", [
          org1,
          "starter_monthly_v1",
        ]),
        /existing_subscription/,
      );
    },
  );
  await t.test(
    "cancellation and failed-renewal status preserve paid access; stale events cannot revert state",
    async () => {
      await value(
        "select public.record_billing_subscription_v1('SUB_one','CUS_owner','PLN_starter','non-renewing',now()+interval '1 minute')",
      );
      await value(
        "select public.record_billing_subscription_v1('SUB_one','CUS_owner','PLN_starter','active',now()-interval '1 minute')",
      );
      const s = await value("select public.get_billing_summary_v1($1)", [org1]);
      assert.equal(s.can_write, true);
      assert.equal(s.provider_status, "non-renewing");
      assert.equal(s.paid_until, paymentEnd);
    },
  );
  await t.test(
    "unmapped recurring charges cannot grant a subscription",
    async () => {
      await assert.rejects(
        pay({ reference: "renewal_bad", id: "124", customer: "CUS_other" }),
        /unmapped_or_ambiguous/,
      );
      await assert.rejects(
        pay({ reference: "renewal_bad", id: "124", amount: 1 }),
        /payment_price_mismatch/,
      );
      const old = await pay({
        reference: "renewal_old",
        id: "125",
        paidAt: "2025-01-31T09:00:00.000Z",
      });
      assert.equal(old.applied, true);
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1]))
          .paid_until,
        paymentEnd,
      );
      assert.equal(
        new Date(
          await value(
            "select period_end::text from public.billing_payments where reference='renewal_old'",
          ),
        ).toISOString(),
        "2025-02-28T09:00:00.000Z",
      );
    },
  );
  await t.test(
    "one provider transaction cannot be applied to another reference",
    async () => {
      await assert.rejects(
        pay({ reference: "renewal_collision", id: "123" }),
        /payment_identity_collision/,
      );
    },
  );
  await t.test(
    "partial refunds are deduplicated and full refunds remove only the refunded period",
    async () => {
      await value(
        "select public.adjust_billing_payment_v1('refund:1','123','refund',10000,true)",
      );
      await value(
        "select public.adjust_billing_payment_v1('refund:1','123','refund',10000,true)",
      );
      assert.equal(
        await value(
          "select refunded_amount from public.billing_payments where transaction_id='123'",
        ),
        10000,
      );
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1]))
          .can_write,
        true,
      );
      await value(
        "select public.adjust_billing_payment_v1('refund:2','123','refund',14900,true)",
      );
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1])).state,
        "read_only",
      );
      assert.equal((await pay()).applied, false);
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1]))
          .can_write,
        false,
      );
    },
  );
  await t.test(
    "expiry and refund deny writes while records and billing recovery remain readable",
    async () => {
      await assert.rejects(
        db.query("insert into public.departments(organisation_id) values($1)", [
          org1,
        ]),
        /subscription_read_only/,
      );
      await assert.rejects(
        db.query("update public.organisations set name='changed' where id=$1", [
          org1,
        ]),
        /subscription_read_only/,
      );
      await db.exec("set role authenticated");
      assert.equal(await value("select count(*) from public.employees"), 16);
      assert.equal(
        await value("select count(*) from public.billing_payments"),
        2,
      );
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        employee,
      ]);
      assert.equal(
        await value("select count(*) from public.billing_payments"),
        0,
      );
      const summary = await value("select public.get_billing_summary_v1($1)", [
        org1,
      ]);
      assert.equal(summary.can_manage, false);
      assert.equal("email" in summary, false);
      assert.equal("customer_code" in summary, false);
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        admin,
      ]);
    },
  );
  await t.test(
    "a valid renewal restores access and disputes are isolated from refunds",
    async () => {
      const renewal = await pay({ reference: "renewal_new", id: "126" });
      assert.equal(renewal.applied, true);
      await value(
        "select public.adjust_billing_payment_v1('dispute:3','126','dispute',0,true)",
      );
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1]))
          .can_write,
        false,
      );
      await value(
        "select public.adjust_billing_payment_v1('refund:4','126','refund',1,true)",
      );
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1]))
          .can_write,
        false,
      );
      await value(
        "select public.adjust_billing_payment_v1('dispute:3','126','dispute',0,false)",
      );
      assert.equal(
        (await value("select public.get_billing_summary_v1($1)", [org1]))
          .can_write,
        true,
      );
    },
  );
  await t.test(
    "platform billing authority is separate from organisation admin",
    async () => {
      await assert.rejects(
        value("select public.billing_operations_v1()"),
        /billing_operator_required/,
      );
      await assert.rejects(
        value(
          "select public.record_billing_operator_reconciliation_v1($1,'renewal_new')",
          [org1],
        ),
        /billing_operator_required/,
      );
      await db.query(
        "insert into private.billing_operators(user_id) values($1)",
        [admin],
      );
      assert.equal(
        (await value("select public.billing_operations_v1()")).accounts.length,
        2,
      );
      await value(
        "select public.record_billing_operator_reconciliation_v1($1,'renewal_new')",
        [org1],
      );
      assert.equal(
        await value(
          "select count(*) from public.audit_events where event_type='billing.operator_reconciled' and actor_user_id=$1",
          [admin],
        ),
        1,
      );
    },
  );
  await t.test(
    "signed event processing is idempotent and a failed concurrent retry cannot undo success",
    async () => {
      const key = "a".repeat(64);
      assert.equal(
        await value(
          "select public.record_billing_event_v1($1,'charge.success','renewal_new',null)",
          [key],
        ),
        "received",
      );
      await value(
        "select public.finish_billing_event_v1($1,'processed',null)",
        [key],
      );
      await value(
        "select public.finish_billing_event_v1($1,'review','late_failure')",
        [key],
      );
      assert.equal(
        await value(
          "select public.record_billing_event_v1($1,'charge.success','renewal_new',null)",
          [key],
        ),
        "processed",
      );
      assert.equal(
        await value("select count(*) from public.billing_events"),
        1,
      );
      await db.exec("set role authenticated");
      await assert.rejects(
        value(
          "select public.record_billing_event_v1($1,'charge.success','forged_ref',null)",
          ["b".repeat(64)],
        ),
        /permission denied/,
      );
      await assert.rejects(
        value("select public.finish_billing_event_v1($1,'processed',null)", [
          key,
        ]),
        /permission denied/,
      );
      await db.exec("reset role");
    },
  );
  await t.test("historical prices cannot be silently changed", async () => {
    await assert.rejects(
      db.exec(
        "update public.billing_prices set employee_limit=300 where id='starter_monthly_v1'",
      ),
      /require_a_new_version/,
    );
  });
  await t.test(
    "new organisations receive one trial based on creation time",
    async () => {
      const org = "00000000-0000-0000-0000-000000000003";
      await db.query(
        "insert into public.organisations(id,name,created_at) values($1,'Expired trial',now()-interval '31 days')",
        [org],
      );
      await assert.rejects(
        db.query("insert into public.employees(organisation_id) values($1)", [
          org,
        ]),
        /subscription_read_only/,
      );
      assert.equal(
        (await value("select private.billing_access($1)", [org])).can_write,
        false,
      );
      await db.query(
        "insert into public.organisation_memberships values($1,$2,'org_admin',true)",
        [org, admin],
      );
      const c = await value(
        "select public.start_billing_checkout_v1($1,'team_annual_v1')",
        [org],
      );
      await value("select public.claim_billing_checkout_v1($1,'PLN_team')", [
        c.reference,
      ]);
      await assert.rejects(
        value("select public.claim_billing_checkout_v1($1,'PLN_other')", [
          c.reference,
        ]),
        /checkout_initialising/,
      );
      await db.query(
        "update public.billing_checkouts set initialising_until=now()-interval '1 minute' where reference=$1",
        [c.reference],
      );
      assert.equal(
        (
          await value(
            "select public.claim_billing_checkout_v1($1,'PLN_other')",
            [c.reference],
          )
        ).plan_code,
        "PLN_team",
      );
      await assert.rejects(
        value(
          "select public.complete_billing_checkout_v1($1,'PLN_wrong','https://checkout.paystack.com/other')",
          [c.reference],
        ),
        /checkout_not_pending/,
      );
      await value(
        "select public.complete_billing_checkout_v1($1,'PLN_team','https://checkout.paystack.com/team')",
        [c.reference],
      );
      assert.equal(
        (
          await value(
            "select public.claim_billing_checkout_v1($1,'PLN_team')",
            [c.reference],
          )
        ).status,
        "ready",
      );
    },
  );
  await db.close();
});
