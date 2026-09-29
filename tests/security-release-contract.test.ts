import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function migrationCorpus() {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const names = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  const contents = await Promise.all(
    names.map(async (name) => ({
      name,
      content: await readFile(path.join(dir, name), "utf8"),
    }))
  );

  return contents;
}

test("database security hardening remains represented in migrations", async () => {
  const migrations = await migrationCorpus();
  const corpus = migrations.map((item) => item.content).join("\n\n");

  assert.match(
    corpus,
    /revoke\s+insert\s*,\s*update\s*,\s*delete\s*,\s*truncate\s*,\s*references\s*,\s*trigger\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+authenticated\s*,\s*anon\s*;/i,
    "Authenticated and anonymous clients must not regain generic public-table mutations"
  );

  assert.match(
    corpus,
    /grant\s+update\s*\(\s*read_at\s*\)\s+on\s+public\.notifications\s+to\s+authenticated\s*;/i,
    "The one intentional direct client mutation is marking an owned notification read"
  );

  assert.match(
    corpus,
    /revoke\s+select\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+anon\s*;/i,
    "Unauthenticated Data API reads must remain closed"
  );

  assert.match(
    corpus,
    /create\s+or\s+replace\s+function\s+public\.get_workforce_directory\s*\(\s*\)/i,
    "Calendar directory access must use the privacy-safe workforce directory RPC"
  );

  assert.match(
    corpus,
    /grant\s+execute\s+on\s+function\s+public\.validate_employee_invitation_for_delivery\s*\(\s*uuid\s*,\s*text\s*,\s*uuid\s*\)\s+to\s+service_role\s*;/i,
    "Invitation delivery validation must remain service-role only"
  );

  assert.doesNotMatch(
    corpus,
    /grant\s+execute\s+on\s+function\s+public\.validate_employee_invitation_for_delivery\s*\(\s*uuid\s*,\s*text\s*,\s*uuid\s*\)\s+to\s+authenticated\s*;/i,
    "Invitation delivery validation must not be callable by authenticated browsers"
  );
});

test("release dependency installation stays deterministic", async () => {
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

  assert.equal(lock.lockfileVersion, 3);
  assert.match(workflow, /\bnpm ci\b/);
  assert.doesNotMatch(workflow, /\bnpm install\b/);
});
