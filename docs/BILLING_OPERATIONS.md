# Payments and subscription operations

Website pricing links to `https://app.leavectrl.co.za/subscribe` with a plan and billing period. The existing login, email verification and organisation setup happen before payment. A preference cookie preserves the selection; it does not grant access. Only an active, verified organisation administrator can start checkout.

## Commercial catalogue

All plans include core leave, policy, coverage and reporting. The active employee limit is enforced in Postgres, including imports, invitations that create employees, direct API calls and reactivation. Payment never changes user roles or membership.

| Plan | Active employee limit | Monthly, ZAR | Annual, ZAR |
| --- | ---: | ---: | ---: |
| Starter | 15 | 249 | 2,490 |
| Team | 50 | 599 | 5,990 |
| Business | 150 | 1,299 | 12,990 |
| Organisation | 300 | 2,199 | 21,990 |

Prices are stored as integer subunits in eight immutable versioned records. The published annual prices equal ten monthly payments. Enterprise and founding-customer terms require a separate commercial agreement; this checkout does not automatically apply a discount. No VAT invoice or legal entity details are invented.

## Production configuration

1. Add `SUPABASE_SECRET_KEY` (or the legacy `SUPABASE_SERVICE_ROLE_KEY`) in Vercel's **Production** environment for this Supabase project. Enter the value in the provider dashboard, never in chat or a source file. It must not have a `NEXT_PUBLIC_` prefix.
2. The existing production `Live_secret_key` Paystack variable is supported. Alternatively use `PAYSTACK_SECRET_KEY`. The server requires an `sk_live_` key in production. Public keys are not needed for the hosted checkout.
3. Set the Paystack **live webhook URL** to `https://app.leavectrl.co.za/api/billing/webhook` in Paystack integration settings. Checkout passes `https://app.leavectrl.co.za/billing/return` as the callback. Do not point the webhook at the marketing domain.
4. Apply `20261006153721_verified_billing_and_subscription_access.sql`, deploy the matching source, and redeploy after changing environment variables. Set `LEAVECTRL_BILLING_ENABLED=true` in Production only after the live webhook is configured and the rollout is reviewed. This launch switch controls checkout; already-paid receipts continue to reconcile when it is off. The billing page and checkout fail closed if configuration or migration is missing. Preview deployments cannot initialise payments against this production database.
5. Assign platform operators only to explicitly verified responsible accounts. Organisation-admin status is insufficient. An authorised database administrator can use the query below after confirming the exact account; it intentionally requires verified email and a unique matching user.

```sql
insert into private.billing_operators(user_id)
select u.id from auth.users u
where lower(u.email) = 'director@leavectrl.co.za'
  and u.email_confirmed_at is not null
  and (select count(*) from auth.users x
       where lower(x.email) = 'director@leavectrl.co.za') = 1
on conflict do nothing;
```

The accountable contact supplied by the owner is Langa Ludidi, `director@leavectrl.co.za`, `0731433319`. Those details do not establish a company registration or statutory Information Officer designation.

## Allocation and verification

- The server creates an organisation-scoped order with an exact price snapshot and verified payer email. One unsettled checkout per organisation and an initialisation lease prevent parallel checkout creation. Retries reuse the reference and provider plan.
- Paystack creates a recurring card subscription for the selected immutable price. A browser return, a checkbox, a metadata field, a customer email or a `subscription.create` event cannot grant paid time.
- Signed webhooks are checked against the exact raw bytes using HMAC-SHA512. The server fetches the transaction from Paystack and validates successful status, live mode, exact amount, currency, customer, plan and reference before the service-only payment RPC commits.
- A renewal must match a previously verified customer/plan/subscription binding. Ambiguous or unmapped receipts go to review; they are not attached by email or browser-supplied organisation ID.
- Paid periods are derived from the verified payment date. Monthly day 29–31 subscriptions follow Paystack's day-28 renewal rule. Duplicate references and transaction IDs never extend access twice. Lifecycle events cannot extend or truncate paid time.
- After expiry the existing records remain readable and exportable; core business mutations are blocked. Billing remains reachable for recovery. Trials start from organisation creation and last 30 days; migrating existing organisations does not restart trials.
- Full refunds or unresolved disputes remove the affected payment's access contribution. Partial refunds retain the period. Independent adjustments are deduplicated; resolving a dispute does not erase a refund. Refunds and dispute decisions are performed in Paystack, then fetched and reconciled here.

## Administration

Organisation administrators use `/billing` for the current plan, employee usage, access date, payment history, pending payment verification and CSV export. Paystack's hosted management link handles card updates and stopping renewal. Stopping renewal preserves verified paid access until its end. A replacement checkout is available only after access ends and the previous subscription is cancelled or completed.

Separately assigned platform operators use `/billing/control` to review accounts and provider events and reconcile a transaction reference or subscription code. Reconciliation always fetches provider facts; the console has no arbitrary "grant paid" action. Audit records identify verified payment application, adjustments and the operator performing reconciliation.

Plan changes and commercial credits require support review. There is no automatic proration, discount eligibility or overlapping second subscription. A provider timeout leaves the same order pending for reconciliation. Do not expire or replace an uncertain checkout manually: an old checkout might still be payable. Check Paystack's transaction first and resolve it under an approved commercial process.

## Release evidence and remaining live check

Automated tests execute the actual migration in Postgres (PGlite) and check cross-organisation denial, role separation, price matching, test-payment denial, duplicate events, transaction collisions, refunds, disputes, expiry, employee limits, trial dates, checkout locking and historical price immutability. The app's governed-RPC mutation test and production build must pass.

Before advertising checkout as operational, complete a controlled payment through the live provider, confirm the webhook and callback allocate the correct organisation and plan, confirm renewal binding, and inspect the operator queue. No real charge, refund or subscription cancellation is performed by the automated tests. Adding Paystack keys alone is not an end-to-end verification.

Rollback: restore the prior app deployment to remove checkout entry points. Preserve payment ledgers and operator evidence. Do not drop billing tables or erase verified payments. Remove the `billing_write_access` triggers only as an explicit, audited access-policy rollback; a frontend rollback alone does not remove database enforcement.
