import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("backup catalog covers every public table created by migrations", () => {
  const root = process.cwd();
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, "config", "backup-tables.json"), "utf8"),
  );
  const catalogNames = new Set(catalog.map((entry) => entry.name));

  const migrationDir = path.join(root, "supabase", "migrations");
  const migrationFiles = fs.readdirSync(migrationDir).filter((name) => name.endsWith(".sql"));
  const created = new Set();

  for (const filename of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationDir, filename), "utf8");
    const regex = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z0-9_]+)/gi;
    let match;
    while ((match = regex.exec(sql)) !== null) created.add(match[1]);
  }

  const missing = [...created].filter((name) => !catalogNames.has(name)).sort();
  assert.deepEqual(missing, [], `Backup catalog is missing public tables: ${missing.join(", ")}`);
});
