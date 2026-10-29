import { linkSecret } from "@/lib/campaign/requests";
import { issueRequest, recordRequest } from "@/lib/campaign/roster";
import { getVideo, updateCampaign, updateVideo } from "@/lib/campaign/store";

/** The brand approves the re-cut request the agent queued (behind the demo password): a new one-time request link
 *  for the creator, shown once and never stored, exactly like "Make link". */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const { id, videoId } = await ctx.params;
  const video = await getVideo(id, videoId);
  if (!video) return Response.json({ error: "Video not found" }, { status: 404 });
  if (!video.agent?.recut) return Response.json({ error: "The agent has not queued a re-cut request for this video" }, { status: 409 });
  // One approval per queued request: a second click never mints another upload credential.
  if (video.agent.recut.approvedAt)
    return Response.json({ error: "Already approved. Make a new link from the campaign's creator list if you need one." }, { status: 409 });
  const secret = linkSecret();
  if (!secret) return Response.json({ error: "Request links are switched off on this deployment." }, { status: 503 });
  const issued = await issueRequest(id, video.creator, secret);
  const campaign = await updateCampaign(id, (c) => recordRequest(c, issued.creator, issued.record));
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const approvedAt = new Date().toISOString();
  await updateVideo(id, videoId, (v) => (v.agent?.recut ? { ...v, agent: { ...v.agent, recut: { ...v.agent.recut, approvedAt } } } : v));
  return Response.json({ creator: issued.creator, path: issued.path, expiresAt: issued.expiresAt }, { status: 201 });
}
