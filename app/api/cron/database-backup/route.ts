import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import backupTables from "@/config/backup-tables.json";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAGIC = Buffer.from("LCTRL-BACKUP-V1\n");
const PAGE_SIZE = 1000;

type TableSpec = { name: string; pk: string };

type BlobPutResult = {
  url: string;
  pathname: string;
  contentType?: string;
  etag?: string;
};

function serviceClient() {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("backup_service_role_missing");
  return createClient(getSupabasePublicConfig().url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function requireCron(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("backup_cron_secret_missing");
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function exportTable(client: SupabaseClient, spec: TableSpec) {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await client
      .from(spec.name)
      .select("*")
      .order(spec.pk, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`backup_table_failed:${spec.name}:${error.message}`);
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function exportAuthUsers(client: SupabaseClient) {
  const users: Record<string, unknown>[] = [];
  let page = 1;

  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw new Error(`backup_auth_users_failed:${error.message}`);

    const current = data.users.map((user) => ({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: user.role ?? null,
      aud: user.aud,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
      created_at: user.created_at,
      updated_at: user.updated_at,
      confirmed_at: user.confirmed_at ?? null,
      email_confirmed_at: user.email_confirmed_at ?? null,
      phone_confirmed_at: user.phone_confirmed_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      banned_until: user.banned_until ?? null,
    }));

    users.push(...current);
    if (data.users.length < PAGE_SIZE) break;
    page += 1;
  }

  return users;
}

function encryptBackup(payload: unknown) {
  const encodedKey = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!encodedKey) throw new Error("backup_encryption_key_missing");

  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) throw new Error("backup_encryption_key_invalid");

  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), {
    level: 9,
  });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

function blobCredentials() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error("backup_blob_token_missing");

  const envStoreId = process.env.BLOB_STORE_ID?.trim();
  const parsedStoreId = token.split("_")[3];
  const storeId = (envStoreId || parsedStoreId || "").replace(/^store_/, "");
  if (!storeId) throw new Error("backup_blob_store_id_missing");

  return { token, storeId };
}

async function putPrivateBlob(pathname: string, body: Buffer): Promise<BlobPutResult> {
  const { token, storeId } = blobCredentials();
  const requestId = `${storeId}:${Date.now()}:${randomUUID()}`;
  const target = `https://vercel.com/api/blob/?pathname=${encodeURIComponent(pathname)}`;

  const response = await fetch(target, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "x-vercel-blob-store-id": storeId,
      "x-api-blob-request-id": requestId,
      "x-api-blob-request-attempt": "0",
      "x-api-version": "12",
      "x-vercel-blob-access": "private",
      "x-content-type": "application/octet-stream",
      "x-add-random-suffix": "0",
      "x-allow-overwrite": "1",
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `backup_blob_write_failed:${response.status}:${detail.slice(0, 200)}`,
    );
  }

  return (await response.json()) as BlobPutResult;
}

function backupSlots(now: Date) {
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const slots = [`leavectrl/daily/${dayNames[now.getUTCDay()]}.lcbak`];

  if (now.getUTCDay() === 0) {
    const epochWeek = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
    slots.push(`leavectrl/weekly/slot-${epochWeek % 4}.lcbak`);
  }

  if (now.getUTCDate() === 1) {
    const monthIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
    slots.push(`leavectrl/monthly/slot-${monthIndex % 3}.lcbak`);
  }

  return slots;
}

export async function GET(request: Request) {
  if (!requireCron(request)) {
    return Response.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const client = serviceClient();
    const tables: Record<string, Record<string, unknown>[]> = {};
    const tableCounts: Record<string, number> = {};

    for (const spec of backupTables as TableSpec[]) {
      const rows = await exportTable(client, spec);
      tables[spec.name] = rows;
      tableCounts[spec.name] = rows.length;
    }

    const authUsers = await exportAuthUsers(client);
    const { data: privateState, error: privateError } = await client.rpc(
      "backup_private_state_v1",
    );
    if (privateError) {
      throw new Error(`backup_private_state_failed:${privateError.message}`);
    }

    const generatedAt = new Date().toISOString();
    const payload = {
      format: "leavectrl-backup-v1",
      backup_id: randomUUID(),
      generated_at: generatedAt,
      git_commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      source: {
        supabase_project_ref: "nihvucwfzajudsejczzz",
        app_domain: "app.leavectrl.co.za",
      },
      table_counts: tableCounts,
      auth_user_count: authUsers.length,
      auth_users: authUsers,
      private_state: privateState ?? {},
      tables,
      recovery_notes: {
        auth_password_hashes:
          "Not exported by the Admin API. Restored users require password reset or reinvitation.",
        schema:
          "Recreate schema from the Git commit recorded in this backup before restoring data.",
      },
    };

    const encrypted = encryptBackup(payload);
    const now = new Date();
    const slots = backupSlots(now);
    const uploaded: BlobPutResult[] = [];

    for (const pathname of slots) {
      uploaded.push(await putPrivateBlob(pathname, encrypted));
    }

    if (encrypted.length > 60 * 1024 * 1024) {
      console.warn("[backup] snapshot above 60 MB; review Hobby Blob storage headroom");
    }

    console.info(
      `[backup] success tables=${Object.keys(tableCounts).length} users=${authUsers.length} bytes=${encrypted.length} slots=${slots.length}`,
    );

    return Response.json({
      ok: true,
      generated_at: generatedAt,
      encrypted_bytes: encrypted.length,
      table_counts: tableCounts,
      auth_user_count: authUsers.length,
      slots: uploaded.map((item) => item.pathname),
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "backup_failed";
    console.error("[backup] failure", message);
    return Response.json(
      { ok: false, error: "backup_failed", detail: message },
      { status: 500 },
    );
  }
}
