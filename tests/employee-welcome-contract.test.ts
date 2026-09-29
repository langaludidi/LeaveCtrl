import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("new invited employees receive one-time contextual welcome", async () => {
  const activation = await readFile("components/ActivateAccountForm.tsx", "utf8");
  const activatePage = await readFile("app/activate/page.tsx", "utf8");
  const home = await readFile("app/page.tsx", "utf8");
  const myLeave = await readFile("app/my-leave/page.tsx", "utf8");

  assert.match(activation, /router\.push\("\/welcome"\)/);
  assert.match(activatePage, /welcome_completed_at/);
  assert.match(home, /welcome_completed_at/);
  assert.match(home, /redirect\("\/welcome"\)/);
  assert.match(myLeave, /welcome_completed_at/);
  assert.match(myLeave, /redirect\("\/welcome"\)/);
});

test("welcome presents useful context rather than a recurring splash", async () => {
  const source = await readFile("app/welcome/page.tsx", "utf8");

  assert.match(source, /Organisation/);
  assert.match(source, /Employment start date/);
  assert.match(source, /Work schedule/);
  assert.match(source, /Approval route/);
  assert.match(source, /Your current leave position/);
  assert.match(source, /returning visits open directly on My Leave/);
  assert.match(source, /welcome_completed_at[\s\S]*redirect\("\/my-leave"\)/);
});

test("welcome completion is persisted and existing users are backfilled", async () => {
  const migration = await readFile(
    "supabase/migrations/20260929213417_employee_welcome_onboarding_v1.sql",
    "utf8"
  );
  const backfill = await readFile(
    "supabase/migrations/20260929213451_backfill_existing_employee_welcome_completion.sql",
    "utf8"
  );
  const button = await readFile("components/WelcomeCompleteButton.tsx", "utf8");

  assert.match(migration, /welcome_completed_at/);
  assert.match(migration, /complete_employee_welcome/);
  assert.match(backfill, /where user_id is not null/i);
  assert.match(button, /rpc\("complete_employee_welcome"\)/);
  assert.match(button, /router\.replace\("\/my-leave"\)/);
});
