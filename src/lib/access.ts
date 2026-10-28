// A shared demo password guards everything that spends Meta credits or stores files. Viewing stays
// public so judges can open reports from a link. Uses Web Crypto so it also runs in the proxy.

export const ACCESS_COOKIE = "st_access";

export function accessPassword(env: Record<string, string | undefined> = process.env): string | null {
  return env.SCREEN_TIME_PASSWORD?.trim() || null;
}

/** The cookie value for a password: an HMAC, so the cookie never contains the password itself. */
export async function accessToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("screen-time-access-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type AccessDecision = "allow" | "locked" | "disabled";

/**
 * Writes need the cookie. With no password configured, writes are open in development only and
 * switched off everywhere else, so a deploy without the setting fails closed.
 */
export async function decideAccess(
  cookie: string | undefined,
  env: Record<string, string | undefined> = process.env,
): Promise<AccessDecision> {
  const password = accessPassword(env);
  if (!password) return env.NODE_ENV === "development" ? "allow" : "disabled";
  if (!cookie) return "locked";
  return sameString(cookie, await accessToken(password)) ? "allow" : "locked";
}

export function accessError(decision: Exclude<AccessDecision, "allow">): Response {
  return decision === "disabled"
    ? Response.json({ error: "Uploads and runs are switched off on this deployment." }, { status: 503 })
    : Response.json({ error: "Enter the demo password to upload or run videos.", unlock: true }, { status: 401 });
}
