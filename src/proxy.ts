import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, accessError, decideAccess } from "@/lib/access";

// Every write to the API spends credits or stores files, so it needs the demo password. The unlock
// route sets it; the Blob upload route checks it itself because Vercel's own callback hits it too. A creator's
// request-link upload carries a signed link instead, which /api/submit checks; it stores a video but never runs one.
// The one open run is the fixed sample at /api/try, fenced by its own limits.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (request.method === "GET" || request.method === "HEAD") return;
  // /api/try runs one fixed sample under its own per-visitor and daily limits (lib/campaign/try.ts).
  if (pathname === "/api/unlock" || pathname === "/api/blob-upload" || pathname === "/api/try" || pathname.startsWith("/api/submit/")) return;
  const decision = await decideAccess(request.cookies.get(ACCESS_COOKIE)?.value);
  if (decision !== "allow") return accessError(decision);
}

export const config = { matcher: "/api/:path*" };
