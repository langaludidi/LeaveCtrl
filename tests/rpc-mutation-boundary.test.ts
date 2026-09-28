import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOTS = ["app", "components", "lib"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(fullPath)));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

test("application table mutations stay behind governed RPCs", async () => {
  const files = (
    await Promise.all(ROOTS.map((root) => sourceFiles(root)))
  ).flat();

  const violations: string[] = [];
  const directWrite =
    /\.from\(\s*["']([^"']+)["']\s*\)([\s\S]{0,500}?)\.(insert|update|delete|upsert)\s*\(/g;

  for (const file of files) {
    const source = await readFile(file, "utf8");

    for (const match of source.matchAll(directWrite)) {
      const table = match[1];
      const operation = match[3];

      const allowedNotificationRead =
        file.endsWith(path.join("components", "NotificationList.tsx")) &&
        table === "notifications" &&
        operation === "update";

      if (!allowedNotificationRead) {
        violations.push(`${file}: direct ${operation} on ${table}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    "Direct Data API writes bypass governed RPC authorization/auditing"
  );
});
