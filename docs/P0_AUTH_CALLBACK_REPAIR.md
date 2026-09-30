# LeaveCtrl — P0 Authentication Confirmation & Callback Repair

**Status:** OPEN — production blocker  
**Started:** 30 September 2026  
**Canonical domain:** `https://www.leavectrl.co.za`

## Root cause

The application already generated an explicit `/auth/callback`, but its base-URL resolver allowed configured environment values to win before the production canonical-domain safeguard. A stale `NEXT_PUBLIC_APP_URL` or `LEAVECTRL_APP_URL` could therefore cause production-mode code to construct a Vercel deployment callback.

Separately, the employee-invitation Edge Function defaulted to `https://leave-ctrl.vercel.app`, which was another non-canonical authentication URL source.

Supabase Auth logs also prove signup requests originated from a duplicate-project Vercel preview during testing. This makes preview/production separation material because `@supabase/ssr` uses PKCE: the verifier is stored in a cookie on the origin where the flow begins and must be available when the callback exchanges the one-time code.

## Source repair

- Production callback base is pinned to `https://www.leavectrl.co.za`.
- Authentication URL construction no longer consumes `NEXT_PUBLIC_APP_URL` or `VERCEL_PROJECT_PRODUCTION_URL`.
- `LEAVECTRL_APP_URL` is the only named application URL variable used by auth code, and a bad production value cannot override the canonical domain.
- Production authentication email actions may start only on `https://www.leavectrl.co.za`; production Vercel aliases are rejected before Supabase receives the request so PKCE state cannot be split across origins.
- Preview authentication email actions are blocked by default.
- Deliberate preview auth requires `LEAVECTRL_ENABLE_PREVIEW_AUTH_EMAIL=true` and remains on the exact preview origin.
- Existing `/auth/callback` remains authoritative and now validates callback origin, maps provider/link errors to recovery copy and uses no-store responses.
- Employee invitation callback generation is pinned to the canonical custom domain.
- Customer-facing “Resend confirmation” copy is replaced with “Send confirmation email again”.
- Signup result copy is non-enumerating and does not imply that every submitted email created a new account.

## Current external configuration gaps

The connected Vercel capability does not expose project environment-variable values/scopes, so Production/Preview/Development presence must still be verified in project settings without exposing secret values.

The connected Supabase capability does not expose Auth → URL Configuration settings. Final sign-off still requires direct verification that Site URL and Redirect URLs match the production contract.

## Acceptance test status

Not yet complete. A brand-new production email journey must be performed against the exact deployed repair commit after the Vercel deployment-rate limit permits deployment through canonical project `leave-ctrl`.

Do not close this P0 based only on CI or source review.
