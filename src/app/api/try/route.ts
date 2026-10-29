import { after } from "next/server";
import { executeRun, startRun } from "@/lib/campaign/runner";
import { startTry } from "@/lib/campaign/try";

// The sample run goes on after the response, like any run.
export const maxDuration = 300;

/** "Try a sample video", open to everyone (no password): starts or joins a sample run, or names the latest one to
 *  replay when a limit is reached. Returns { mode, campaignId, videoId, reason? }. */
export async function POST(req: Request) {
  // Vercel sets x-forwarded-for; its first address is the visitor.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  let result;
  try {
    result = await startTry(ip);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not start the sample" }, { status: 500 });
  }
  if (result.mode === "unavailable") return Response.json({ error: result.error }, { status: result.status });
  if (result.mode === "started") {
    const start = await startRun(result.video.campaignId, result.video.id);
    if (!start.ok) return Response.json({ error: start.error }, { status: start.status });
    after(() => executeRun(start.campaign, start.video));
  }
  return Response.json(
    { mode: result.mode, campaignId: result.video.campaignId, videoId: result.video.id, reason: result.reason, limit: result.limit },
    { status: result.mode === "started" ? 202 : 200 },
  );
}
