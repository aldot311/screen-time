// "Request video from creator": the brand makes a signed, expiring link for one creator; the creator opens it, agrees
// to the analysis and uploads the delivered video. The link is the creator's only credential, so it is an HMAC over
// what it allows (campaign, creator, expiry, a one-time id). Uploads through it are stored but never run: running
// spends Meta credits and stays behind the brand's password.
import { Creator } from "./schema";
import { isValidId } from "./store";

export const REQUEST_TTL_DAYS = 14;

export interface RequestClaims {
  campaignId: string;
  creator: string; // "@handle"
  exp: number; // unix seconds
  nonce: string; // one video per link
}

/** The words the creator agrees to; stored with the video so the consent is on record. */
export function consentText(brand: string): string {
  return `I agree that ${brand} may analyse this video with AI (Meta SAM 3.1, Muse Spark and Muse Voice Transcribe) to check the sponsorship terms.`;
}

/**
 * The signing secret: SCREEN_TIME_LINK_SECRET, else the demo password (both at least 12 characters). Development falls
 * back to a fixed secret; anywhere else no secret means request links are off.
 */
export function linkSecret(env: Record<string, string | undefined> = process.env): string | null {
  for (const v of [env.SCREEN_TIME_LINK_SECRET, env.SCREEN_TIME_PASSWORD]) {
    const s = v?.trim();
    if (s && s.length >= 12) return s;
  }
  return env.NODE_ENV === "development" ? "development-only-request-link-secret" : null;
}

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

async function sign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(`request-link-v1:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export async function createRequestToken(claims: RequestClaims, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  return `${body}.${await sign(body, secret)}`;
}

/** The claims of a valid, unexpired token, or null for anything else. */
export async function verifyRequestToken(
  token: string,
  secret: string | null,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<RequestClaims | null> {
  if (!secret || typeof token !== "string" || token.length > 2048) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = await sign(body, secret);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<RequestClaims>;
    if (!isValidId(c.campaignId) || typeof c.nonce !== "string" || !/^[a-z0-9]{8,32}$/.test(c.nonce)) return null;
    if (typeof c.exp !== "number" || c.exp <= nowSec) return null;
    const creator = Creator.safeParse(c.creator);
    if (!creator.success || creator.data !== c.creator) return null;
    return { campaignId: c.campaignId, creator: c.creator, exp: c.exp, nonce: c.nonce };
  } catch {
    return null;
  }
}

export function newNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join("");
}
