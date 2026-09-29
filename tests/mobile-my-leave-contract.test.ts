import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("My Leave landing is rule-aware rather than annual-balance-only", async () => {
  const source = await readFile("app/my-leave/page.tsx", "utf8");

  assert.match(source, /employee_visible/);
  assert.match(source, /entitlement_method/);
  assert.match(source, /cycle_months/);
  assert.match(source, /method === "event_based"/);
  assert.match(source, /method === "no_balance"/);
  assert.match(source, /Event-based entitlement/);
  assert.match(source, /No balance/);
  assert.match(source, /Current 36-month cycle|Current \$\{policy\?\.cycle_months \?\? 36\}-month cycle/);
  assert.match(source, /TOIL/);
});

test("mobile landing prioritises book leave, available leave, pending and next absence", async () => {
  const source = await readFile("app/my-leave/page.tsx", "utf8");

  const bookIndex = source.indexOf("Book leave");
  const availableIndex = source.indexOf("AVAILABLE LEAVE");
  const pendingIndex = source.indexOf("PENDING");
  const nextIndex = source.indexOf("NEXT ABSENCE");
  const teamIndex = source.indexOf("Team availability");

  assert.ok(bookIndex > -1);
  assert.ok(availableIndex > bookIndex);
  assert.ok(pendingIndex > availableIndex);
  assert.ok(nextIndex > availableIndex);
  assert.ok(teamIndex > pendingIndex);
  assert.match(source, /Your leave and availability at a glance\./);
});

test("team context uses privacy-safe workforce RPCs", async () => {
  const source = await readFile("app/my-leave/page.tsx", "utf8");

  assert.match(source, /rpc\("get_workforce_directory"\)/);
  assert.match(source, /rpc\("get_workforce_calendar"/);
  assert.match(source, /absence\.display_label \?\? "Away"/);
  assert.doesNotMatch(source, /medical|diagnosis/i);
});

test("mobile shell consolidates brand, notifications, avatar and menu", async () => {
  const shell = await readFile("components/AppShell.tsx", "utf8");
  const css = await readFile("app/globals.css", "utf8");

  assert.match(shell, /mobile-header-actions/);
  assert.match(shell, /mobile-header-notifications/);
  assert.match(shell, /mobile-header-avatar/);
  assert.match(shell, /mobile-account-menu/);
  assert.match(shell, /Sign out/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.topbar\{display:none\}/);
  assert.match(css, /\.mobile-nav-toggle\{width:44px;height:44px/);
  assert.match(css, /\.mobile-header-notifications\{width:44px;height:44px/);
});

test("ordinary employees land directly on My Leave", async () => {
  const home = await readFile("app/page.tsx", "utf8");
  const activate = await readFile("app/activate/page.tsx", "utf8");
  const activateForm = await readFile("components/ActivateAccountForm.tsx", "utf8");

  assert.match(home, /if \(!hasOperationalHome\) redirect\("\/my-leave"\)/);
  assert.match(activate, /redirect\("\/my-leave"\)/);
  assert.match(activateForm, /router\.push\("\/my-leave"\)/);
});

test("landing remains compact on narrow phones and accessible", async () => {
  const css = await readFile("app/globals.css", "utf8");
  const source = await readFile("app/my-leave/page.tsx", "utf8");

  assert.match(css, /\.my-leave-action-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:360px\)\{\.my-leave-action-grid\{grid-template-columns:1fr\}/);
  assert.match(source, /aria-labelledby="available-leave-heading"/);
  assert.match(source, /aria-labelledby="team-availability-heading"/);
  assert.match(source, /aria-label="Calendar legend"/);
  assert.match(source, /aria-label=\{label\}/);
});
