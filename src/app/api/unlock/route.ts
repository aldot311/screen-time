import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessPassword, accessToken, decideAccess, sameString } from "@/lib/access";

export async function GET() {
  const jar = await cookies();
  return Response.json({ unlocked: (await decideAccess(jar.get(ACCESS_COOKIE)?.value)) === "allow" });
}

export async function POST(req: Request) {
  const password = accessPassword();
  if (!password) return Response.json({ error: "No demo password is set on this deployment." }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
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

// Best-effort attempt limit: 10 tries per address and 100 overall per 15 minutes, per server instance.
// Serverless instances do not share this memory, so the real protection is a long random password
// (accessPassword refuses anything under 12 characters); this only blunts a single-instance flood.
const WINDOW_MS = 15 * 60_000;
const attempts = new Map<string, number[]>();

function allowAttempt(ip: string, now = Date.now()): boolean {
  const recent = (k: string) => (attempts.get(k) ?? []).filter((t) => now - t < WINDOW_MS);
  const mine = recent(ip);
  const all = recent("*");
  if (mine.length >= 10 || all.length >= 100) return false;
  attempts.set(ip, [...mine, now]);
  attempts.set("*", [...all, now]);
  return true;
}
