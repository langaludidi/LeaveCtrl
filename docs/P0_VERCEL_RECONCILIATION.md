# LeaveCtrl — P0 Vercel Production Deployment Reconciliation

**Status:** OPEN — release blocker  
**Date:** 30 September 2026  
**Repository:** `langaludidi/LeaveCtrl`  
**Production domain:** `https://www.leavectrl.co.za`

This document records deployment-path evidence only. It does not contain secret values.

## 1. Confirmed divergence

The production domain currently resolves to Vercel project **`leave-ctrl`**, deployment **`dpl_Cej6MeE3U6s4GRESLzTHgbEZ6HUj`**, commit **`47a78c9c0675efc8d5698aae3a966a75efbef6db`**.

A second Vercel project, **`leave-ctrl-2eqn`**, is also connected to the same GitHub repository and has deployed newer commits. Its newer READY deployments do not make the production domain current.

The two Vercel projects were created approximately 59 seconds apart. Accessible evidence cannot prove the exact project-creation action, but it supports duplicate import/project creation rather than an intentionally separated production architecture.

## 2. Vercel comparison

| Item | `leave-ctrl` | `leave-ctrl-2eqn` | P0 disposition |
| --- | --- | --- | --- |
| GitHub repository observed in deployments | `langaludidi/LeaveCtrl` | `langaludidi/LeaveCtrl` | Same source |
| Production branch observed | `main` | `main` | Both compete for the same branch |
| Custom domains | `www.leavectrl.co.za`, `leavectrl.co.za`, canonical project aliases | No LeaveCtrl custom domain observed | Strong canonical evidence for `leave-ctrl` |
| Last known-good domain deployment | `dpl_Cej6MeE3U6s4GRESLzTHgbEZ6HUj` / `47a78c9...` | Not applicable to custom domain | Rollback candidate |
| Newer production deployment observed | Latest production attempt behind current main; later pushes rate-limited | `dpl_4DeD6nnmc6mpq33ikum2gkbwPSLh` / `f71254ba...` READY | Duplicate READY is not production-domain evidence |
| Region observed | `dub1` | `dub1` | No material difference observed |
| Repository Vercel config | Next.js, Fluid Compute, `dub1` | Same repository config | Shared |
| Recent runtime errors | No grouped runtime errors in recent 7-day check | Historical old-deployment Supabase-config error group; latest inspected routes healthy | Recheck after candidate deployment |
| Health endpoint | 200 on production domain | 200 on inspected newer deployment | Both executable |
| Project framework override | Not exposed by connected project-settings API | Not exposed | Must verify in project-admin console |
| Root directory override | Not exposed | Not exposed | Must verify before promotion |
| Build/install/output overrides | Not exposed | Not exposed | Must verify before promotion |
| Node/runtime project setting | Not exposed | Not exposed | Compare against CI Node 22 / supported Vercel runtime |
| Production/Preview env-variable presence and target scoping | Not exposed | Not exposed | Compare names/presence only; never print secret values |
| Deployment protection | Not exposed | Not exposed | Verify project-admin setting |
| Observability settings | Detailed project setting not exposed | Detailed project setting not exposed | Verify only if material |
| Git integration project settings | Deployment metadata proves same repo; detailed integration setting not exposed | Same | Verify duplicate is later disconnected after stable production |

## 3. Configuration contract

Application source currently consumes these deployment-relevant names:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_APP_URL`
- `LEAVECTRL_APP_URL`
- Vercel-provided `VERCEL_PROJECT_PRODUCTION_URL`

No secret values are recorded here.

Employee invitation email delivery is handled by the Supabase Edge Function and its Supabase-managed variables/secrets, not by copying Brevo credentials into Vercel. Supabase Auth SMTP/Brevo is also a Supabase Auth configuration boundary.

A production promotion must not copy obsolete Vercel variables blindly. The project-admin comparison should establish presence, environment target, and intended source for each variable without exposing values.

## 4. Canonical production decision

**Selected canonical project: `leave-ctrl`.**

Reasons:
1. it already owns both production custom domains;
2. it is connected to the same authoritative GitHub repository and `main`;
3. it successfully builds newer branch previews, so there is no evidence that the project itself is technically obsolete;
4. switching the domain to the duplicate would introduce avoidable DNS/alias and rollback risk;
5. the duplicate project has already demonstrated split deployment outcomes that consume deployment quota and create ambiguity.

This decision remains conditional only on the required settings/environment comparison revealing no unique valid production configuration that cannot safely be reconciled into `leave-ctrl`.

## 5. Current release candidate state

The pre-P0 `main` head `b5caaaeeb9e6cc7e06ba2f63c2d8fe5611577db0` passed GitHub CI. The P0 reconciliation branch adds migration-history repair, event-based leave backend hardening, regression tests and reconciliation evidence. The **approved production commit is therefore not yet assigned**; it will be the exact merge commit after this P0 branch passes CI and merges.

New Vercel production deployments are currently blocked by the free-plan deployment-rate limit. A READY deployment of an older commit or of the duplicate project does not satisfy this gate.

## 6. Mandatory release-gate evidence completed

- Repository/deployed Supabase migrations: **64 / 64**, zero mismatches on the P0 branch.
- Privileged authenticated `SECURITY DEFINER` functions: anonymous/PUBLIC exposure **0**; missing direct authentication guard **0**; missing pinned search path **0**.
- Two-way tenant isolation: PASS.
- Direct cross-tenant employee-table mutation: denied.
- Legitimate manager decision authority: PASS.
- Employee self-approval rejection: PASS.
- Cross-tenant admin decision rejection: PASS.
- Manager HR/remuneration mutation rejection: PASS.
- Annual Leave full rollback-only lifecycle and balance restoration: PASS.
- TOIL full rollback-only lifecycle and balance restoration: PASS.
- Annual Leave preview: PASS.
- Sick Leave preview/cycle logic: PASS for configured test identity.
- Family Responsibility: eligibility/public-holiday/insufficient-entitlement blockers behave explicitly.
- Unpaid Leave: no-running-balance semantics PASS.
- Employer-defined leave: rollback-only configure + entitlement + preview PASS.
- Parental Leave: manual-allocation path tested successfully in rollback.
- Adoption, Maternity/Birth-Parent and Commissioning Parental: true event-based paths now fail closed with eligibility-check semantics rather than numerical-balance semantics.
- My Leave source/contract coverage includes compact mobile header, Book Leave CTA, compact balances, pending/next absence, privacy-safe team context, one-time welcome, loading skeletons and accessibility/touch-target guards.
- Health endpoint: 200 on current production domain and inspected newer duplicate deployment.

## 7. Gates still open

1. Vercel deployment-rate limit must clear (or plan capacity must otherwise allow the candidate build).
2. Project-admin settings/environment comparison must be completed for both projects.
3. P0 branch must pass GitHub CI and merge; the exact merge SHA becomes the only acceptable deployment candidate.
4. That exact SHA must build through `leave-ctrl`.
5. `www.leavectrl.co.za` must be verified to resolve to that exact deployment/SHA.
6. Controlled authenticated production smoke must pass without uncontrolled test data.
7. Browser/device regression remains required for desktop/tablet/mobile and Safari/Chromium coverage.
8. Auth email delivery remains a separate open production gate: recent logs contain successful recovery request responses but also same-day SMTP DNS failures; email receipt/reset completion must be proven.
9. Fresh backup/recovery evidence remains open.
10. Duplicate project must remain in place until canonical production is stable and project-admin comparison confirms it has no unique required configuration.

## 8. Rollback

**Last known-good deployment:** `dpl_Cej6MeE3U6s4GRESLzTHgbEZ6HUj`  
**Commit:** `47a78c9c0675efc8d5698aae3a966a75efbef6db`  
**Project:** `leave-ctrl`

If a promoted candidate causes authentication failure, tenant-isolation/authorization regression, migration/data-integrity failure, critical leave-calculation regression or application-wide runtime failure, restore the last known-good deployment through Vercel's rollback/promote mechanism for the canonical project and verify both production aliases resolve to it. Do not live-debug a security-critical failure while leaving the failing deployment promoted.

## 9. Definition of done

This document remains **OPEN** until:
- the exact approved P0 merge SHA is deployed through `leave-ctrl`;
- production-domain commit/deployment identity is verified;
- production smoke/browser gates pass;
- rollback remains known-good;
- duplicate-project ambiguity is removed in a controlled manner;
- the Library Build Handoff records the same final evidence.

Until then LeaveCtrl is **not production-current and not release-ready**.
