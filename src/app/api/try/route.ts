import { after } from "next/server";
import { executeRun, startRun } from "@/lib/campaign/runner";
import { startTry } from "@/lib/campaign/try";
import { putVideo } from "@/lib/campaign/store";
import { clientIp, clientKey } from "@/lib/client-ip";
import { allowPublicAttempt, fromOwnPage } from "@/lib/agent/public-limits";

// The sample run goes on after the response, like any run.
export const maxDuration = 300;

/** "Try a sample video", open to everyone (no password): starts or joins a sample run, or names the latest one to
 *  replay when a limit is reached. Returns { mode, campaignId, videoId, reason? }. Fenced like the open agent route:
 *  only this site's own page may start it, and one address gets a few attempts per ten minutes before the store. */
export async function POST(req: Request) {
  if (!fromOwnPage(req)) return Response.json({ error: "Start the sample from its page on this site." }, { status: 403 });
  const ip = clientIp(req.headers);
  // Its own key space, so the sample and the agent do not share one visitor's attempts.
  if (!allowPublicAttempt(`try:${clientKey(ip)}`)) return Response.json({ error: "Too many tries. Wait a few minutes and try again." }, { status: 429 });
  let result;
  try {
    result = await startTry(ip);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not start the sample" }, { status: 500 });
  }
  if (result.mode === "unavailable") return Response.json({ error: result.error }, { status: result.status });
  if (result.mode === "started") {
    const start = await startRun(result.video.campaignId, result.video.id);
    if (!start.ok) {
      // Never leave an entry that looks like a run in progress: later visitors would join it.
      await putVideo({ ...result.video, status: "failed", error: start.error }).catch(() => undefined);
      return Response.json({ error: start.error }, { status: start.status });
    }
    after(() => executeRun(start.campaign, start.video));
  }
  return Response.json(
    { mode: result.mode, campaignId: result.video.campaignId, videoId: result.video.id, reason: result.reason, limit: result.limit },
    { status: result.mode === "started" ? 202 : 200 },
  );
}
