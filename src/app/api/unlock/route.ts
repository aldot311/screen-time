import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessPassword, accessToken, decideAccess, sameString } from "@/lib/access";

export async function GET() {
  const jar = await cookies();
  return Response.json({ unlocked: (await decideAccess(jar.get(ACCESS_COOKIE)?.value)) === "allow" });
}

export async function POST(req: Request) {
  const password = accessPassword();
  if (!password) return Response.json({ error: "No demo password is set on this deployment." }, { status: 503 });
  // Vercel sets x-real-ip itself; the leftmost X-Forwarded-For entry is client-supplied and spoofable.
  const ip = (req.headers.get("x-real-ip") ?? "unknown").slice(0, 64);
  if (!allowAttempt(ip)) {
    return Response.json({ error: "Too many tries. Wait 15 minutes and try again." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const given = typeof body?.password === "string" ? body.password : "";
  // A short fixed delay on every attempt slows guessing further.
  await new Promise((r) => setTimeout(r, 400));
  if (!sameString(await accessToken(given), await accessToken(password))) {
    return Response.json({ error: "That password is not right." }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, await accessToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return Response.json({ unlocked: true });
}

// Best-effort attempt limit: 10 tries per address per 15 minutes, per server instance. There is no
// global cap, so nobody can lock everyone else out. Serverless instances do not share this memory, so
// the real protection is a long random password (accessPassword refuses anything under 12 characters).
const WINDOW_MS = 15 * 60_000;
const MAX_TRACKED = 5_000;
const attempts = new Map<string, number[]>();

function allowAttempt(ip: string, now = Date.now()): boolean {
  for (const [k, ts] of attempts) if (ts.every((t) => now - t >= WINDOW_MS)) attempts.delete(k);
  const mine = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (mine.length >= 10) return false;
  if (!attempts.has(ip) && attempts.size >= MAX_TRACKED) return true; // full: stay open rather than grow
  attempts.set(ip, [...mine, now]);
  return true;
}
