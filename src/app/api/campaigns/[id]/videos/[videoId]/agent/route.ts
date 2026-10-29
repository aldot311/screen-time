import { after } from "next/server";
import { API_KEY_ENV } from "@/lib/meta/http";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { TRY_ID } from "@/lib/campaign/try";
import { getCampaign, getVideo, updateVideo } from "@/lib/campaign/store";
import { AGENT_STALE_MS, executeAgent } from "@/lib/agent/run-agent";

// The agent runs after the response; re-checking a re-cut inside it needs the same time as a run.
export const maxDuration = 300;

/** Starts the follow-up agent on a finished video (behind the demo password). The video page shows its steps. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const { id, videoId } = await ctx.params;
  if (id === PREVIEW_ID || id === TRY_ID) return Response.json({ error: "Sample and preview reports are shared and read-only" }, { status: 409 });
  if (!process.env[API_KEY_ENV]) return Response.json({ error: "The Meta API key is not configured" }, { status: 503 });
  const campaign = await getCampaign(id);
  const video = campaign ? await getVideo(id, videoId) : null;
  if (!campaign || !video) return Response.json({ error: "Video not found" }, { status: 404 });
  if (video.status !== "done" || !video.report) return Response.json({ error: "The agent follows up on a finished report" }, { status: 409 });
  const busy = video.agent?.status === "running" && Date.now() - Date.parse(video.updatedAt) < AGENT_STALE_MS;
  if (busy) return Response.json({ error: "The follow-up agent is already working on this video" }, { status: 409 });
  const started = await updateVideo(id, videoId, (v) => ({ ...v, agent: { status: "running", startedAt: new Date().toISOString(), steps: [], usd: 0 } }));
  if (!started) return Response.json({ error: "Video not found" }, { status: 404 });
  after(() => executeAgent(campaign, started));
  return Response.json(started.agent, { status: 202 });
}
