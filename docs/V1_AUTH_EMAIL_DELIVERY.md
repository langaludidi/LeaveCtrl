# LeaveCtrl V1 — Auth Email Delivery

## Current blocker

Supabase Auth password-recovery requests are failing before email delivery because the configured SMTP hostname is:

`smtp-reply.brevo.com`

Brevo's SMTP relay hostname is:

`smtp-relay.brevo.com`

## Required Supabase Auth SMTP correction

In the Supabase dashboard for project `nihvucwfzajudsejczzz`:

1. Open **Authentication** → SMTP / Email provider settings.
2. Change SMTP host to `smtp-relay.brevo.com`.
3. Use the Brevo SMTP login shown in Brevo's SMTP & API settings.
4. Use a Brevo **SMTP key**, not an API key.
5. Use port 587 unless the configured Brevo account specifically requires another supported port.
6. Save the configuration.

Do not commit the SMTP password/key into GitHub or application source.

## Verification

After saving:

- request password recovery from `https://leave-ctrl.vercel.app/login`;
- confirm Supabase Auth logs show `POST /recover` with status 200;
- confirm the email arrives;
- follow the link to the LeaveCtrl recovery callback/reset page;
- set a compliant password;
- verify the previous refresh sessions are revoked;
- sign in with the new password.

## Evidence before release

Record:

- test timestamp;
- recovery request HTTP result;
- email receipt result;
- reset completion result;
- post-reset sign-in result.

This remains a production release gate until verified end-to-end.
