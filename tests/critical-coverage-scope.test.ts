import assert from "node:assert/strict";
import test from "node:test";

import * as accessGate from "../lib/access-gate.ts";
import * as appBaseUrl from "../lib/app-base-url.ts";
import * as authMessages from "../lib/auth-messages.ts";
import * as authVerification from "../lib/auth-verification.ts";
import * as billingCatalog from "../lib/billing/catalog.ts";
import * as billingRetry from "../lib/billing/retry.ts";
import * as billingVerification from "../lib/billing/verification.ts";
import * as csvExport from "../lib/csv-export.ts";
import * as employeeCsv from "../lib/employee-csv.ts";
import * as passwordPolicy from "../lib/password-policy.ts";
import * as leaveLiability from "../lib/leave-liability.ts";
import * as machineAccess from "../lib/machine-access.ts";
import * as safeInternalPath from "../lib/safe-internal-path.ts";

test("critical coverage scope remains explicitly loaded", () => {
  assert.equal(typeof accessGate.accessGateRedirect, "function");
  assert.equal(typeof appBaseUrl.resolveAppBaseUrl, "function");
  assert.equal(typeof authMessages.signInErrorMessage, "function");
  assert.equal(typeof authVerification.hasVerifiedEmailOwnership, "function");
  assert.equal(typeof billingCatalog.selectedPrice, "function");
  assert.equal(typeof billingRetry.retrySubscriptionLinkAfterPaymentRace, "function");
  assert.equal(typeof billingVerification.checkedCharge, "function");
  assert.equal(typeof csvExport.safeCsvCell, "function");
  assert.equal(typeof employeeCsv.parseCsv, "function");
  assert.equal(typeof passwordPolicy.validatePassword, "function");
  assert.equal(typeof leaveLiability.annualLeaveLiabilityByEmployee, "function");
  assert.equal(typeof machineAccess.cronAuthorizationMatches, "function");
  assert.equal(typeof safeInternalPath.safeInternalPath, "function");
});
