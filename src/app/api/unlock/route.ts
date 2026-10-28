import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessPassword, accessToken, decideAccess, sameString } from "@/lib/access";

export async function GET() {
  const jar = await cookies();
  return Response.json({ unlocked: (await decideAccess(jar.get(ACCESS_COOKIE)?.value)) === "allow" });
}

export async function POST(req: Request) {
  const password = accessPassword();
  if (!password) return Response.json({ error: "No demo password is set on this deployment." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const given = typeof body?.password === "string" ? body.password : "";
  // A short fixed delay on every attempt slows guessing without a rate-limit store.
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
