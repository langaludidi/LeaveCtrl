# V1 critical-business-logic coverage scope

LeaveCtrl's V1 release gate requires measurable coverage of the deterministic business and security logic that can be meaningfully exercised in the Node test runner.

The coverage gate is intentionally **not** a whole-repository percentage. Server components, CSS and generated/framework code would distort the result. Database/RPC behaviour is instead exercised by the PGlite billing suite, migration-contract tests and live negative UAT.

The enforced Node coverage scope is:

- `lib/access-gate.ts`
- `lib/app-base-url.ts`
- `lib/auth-messages.ts`
- `lib/auth-verification.ts`
- `lib/billing/catalog.ts`
- `lib/billing/retry.ts`
- `lib/billing/verification.ts`
- `lib/csv-export.ts`
- `lib/employee-csv.ts`
- `lib/password-policy.ts`
- `lib/safe-internal-path.ts`

CI fails unless this scope achieves at least:

- **80% line coverage**
- **80% function coverage**
- **70% branch coverage**

The lower branch threshold recognises defensive error branches while preserving the V1 handoff's minimum 80% critical-business-logic coverage requirement on lines/functions.

`tests/critical-coverage-scope.test.ts` imports every scoped module so a file cannot silently disappear from the coverage report simply because no test references it.

Any new V1-critical deterministic business/security module must be added to both this document and the CI coverage include list.
