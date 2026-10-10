import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { checkBreachedPassword } from "../lib/breached-password.ts";

const password = "Private Fixture 123!";
const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
const response = (body: string, status = 200) => (async () => new Response(body, { status })) as typeof fetch;

test("breach query discloses only five hash characters and requests padded uncached results", async () => {
  const request = (async (url, options) => {
    assert.equal(url, `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.redirect, "error");
    assert.deepEqual(options?.headers, { "Add-Padding": "true" });
    assert.ok(options?.signal);
    return new Response(`${hash.slice(5)}:7\r\n${"0".repeat(35)}:0`);
  }) as typeof fetch;
  const result = await checkBreachedPassword(password, request);
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.message, /data breach/);
});

test("zero-count padding is not a breach and password whitespace is preserved", async () => {
  assert.equal((await checkBreachedPassword(password, response(`${hash.slice(5)}:0`))).valid, true);
  assert.equal((await checkBreachedPassword(` ${password}`, response(`${hash.slice(5)}:1`))).valid, true);
});

test("timeouts, provider failures, empty or malformed responses fail closed", async () => {
  for (const request of [response("unavailable", 503), response(""), response("not a hash"),
    response(`${hash.slice(5)}:0\nmalformed`), (async () => { throw new Error("timeout"); }) as typeof fetch]) {
    const result = await checkBreachedPassword(password, request);
    assert.equal(result.valid, false);
    if (!result.valid) assert.match(result.message, /unavailable/);
  }
});
