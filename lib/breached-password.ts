import { createHash } from "node:crypto";

export type BreachCheck = { valid: true } | { valid: false; message: string };
const unavailable = { valid: false as const, message: "Password security verification is unavailable. Please try again shortly." };

/** Only a five-character SHA-1 prefix leaves this server. Never log passwords or hashes. */
export async function checkBreachedPassword(password: string, request: typeof fetch = fetch): Promise<BreachCheck> {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  try {
    const response = await request(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" }, cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return unavailable;
    const body = await response.text();
    if (!body.trim() || body.length > 1_000_000) return unavailable;
    let compromised = false;
    for (const line of body.trim().split(/\r?\n/)) {
      const match = /^([A-F0-9]{35}):(\d+)$/.exec(line);
      if (!match) return unavailable;
      if (match[1] === hash.slice(5) && /[1-9]/.test(match[2])) compromised = true;
    }
    return compromised
      ? { valid: false, message: "This password has appeared in a data breach. Choose a different, unique password." }
      : { valid: true };
  } catch {
    return unavailable;
  }
}
