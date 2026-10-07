import fs from "node:fs";
import { createDecipheriv } from "node:crypto";
import { gunzipSync } from "node:zlib";

const MAGIC = Buffer.from("LCTRL-BACKUP-V1\n");
const file = process.argv[2];
const keyText = process.env.BACKUP_ENCRYPTION_KEY?.trim();

if (!file) {
  console.error("Usage: BACKUP_ENCRYPTION_KEY=... npm run backup:verify -- <backup.lcbak>");
  process.exit(2);
}
if (!keyText) {
  console.error("BACKUP_ENCRYPTION_KEY is required");
  process.exit(2);
}

const key = Buffer.from(keyText, "base64");
if (key.length !== 32) {
  console.error("BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  process.exit(2);
}

const input = fs.readFileSync(file);
if (!input.subarray(0, MAGIC.length).equals(MAGIC)) {
  console.error("Not a LeaveCtrl backup file");
  process.exit(1);
}

const ivStart = MAGIC.length;
const tagStart = ivStart + 12;
const cipherStart = tagStart + 16;
const iv = input.subarray(ivStart, tagStart);
const tag = input.subarray(tagStart, cipherStart);
const ciphertext = input.subarray(cipherStart);

const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);
const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
const json = gunzipSync(compressed).toString("utf8");
const backup = JSON.parse(json);

if (backup.format !== "leavectrl-backup-v1") {
  console.error("Unexpected backup format");
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  format: backup.format,
  backup_id: backup.backup_id,
  generated_at: backup.generated_at,
  git_commit: backup.git_commit,
  tables: Object.keys(backup.tables ?? {}).length,
  auth_users: backup.auth_user_count,
  table_counts: backup.table_counts,
}, null, 2));
