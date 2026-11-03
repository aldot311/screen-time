import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, accessError, decideAccess } from "@/lib/access";
import { linkSecret } from "@/lib/campaign/requests";
import { issueRequest, recordRequest } from "@/lib/campaign/roster";
import { getVideo, updateCampaign, updateVideo } from "@/lib/campaign/store";

/** The brand approves the re-cut request the agent queued (behind the demo password, on every report): a new one-time
 *  request link for the creator, shown once and never stored, exactly like "Make link". */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const { id, videoId } = await ctx.params;
  // Checked here as well as in the proxy: the link is the creator's upload credential, so this never opens with the agent.
  const decision = await decideAccess(req.cookies.get(ACCESS_COOKIE)?.value);
  if (decision !== "allow") return accessError(decision);
  const video = await getVideo(id, videoId);
  if (!video) return Response.json({ error: "Video not found" }, { status: 404 });
  const queued = video.agent;
  if (!queued?.recut) return Response.json({ error: "The agent has not queued a re-cut request for this video" }, { status: 409 });
  if (queued.status !== "done") return Response.json({ error: "The agent is still working. Approve once it has finished." }, { status: 409 });
  if (queued.recut.approvedAt) return alreadyApproved();
  const secret = linkSecret();
  if (!secret) return Response.json({ error: "Request links are switched off on this deployment." }, { status: 503 });

  // One approval per queued request, claimed in one atomic update before anything is minted: of two clicks at once,
  // one makes the link and the other is told it is done. Only the run read above can be approved, not a newer one.
  const approvedAt = new Date().toISOString();
  let won = false;
  const claimed = await updateVideo(id, videoId, (v) => {
    const agent = v.agent;
    won = Boolean(agent?.recut && agent.status === "done" && !agent.recut.approvedAt && agent.startedAt === queued.startedAt);
    return won && agent?.recut ? { ...v, agent: { ...agent, recut: { ...agent.recut, approvedAt } } } : v;
  });
  if (!claimed) return Response.json({ error: "Video not found" }, { status: 404 });
  if (!won) return claimed.agent?.recut?.approvedAt ? alreadyApproved() : Response.json({ error: "The agent ran again. Approve its new request." }, { status: 409 });

  try {
    const issued = await issueRequest(id, video.creator, secret);
    const campaign = await updateCampaign(id, (c) => recordRequest(c, issued.creator, issued.record));
    if (!campaign) {
      await releaseApproval(id, videoId, approvedAt);
      return Response.json({ error: "Campaign not found" }, { status: 404 });
    }
    return Response.json({ creator: issued.creator, path: issued.path, expiresAt: issued.expiresAt }, { status: 201 });
  } catch (err) {
    // No link was handed out: give the approval back so it can be tried again.
    await releaseApproval(id, videoId, approvedAt);
    return Response.json({ error: err instanceof Error ? err.message : "Could not make the link" }, { status: 500 });
  }
}

const alreadyApproved = () =>
  Response.json({ error: "Already approved. Make a new link from the campaign's creator list if you need one." }, { status: 409 });

/** Undoes this request's claim, and only this one's. */
async function releaseApproval(id: string, videoId: string, approvedAt: string) {
  await updateVideo(id, videoId, (v) => {
    const recut = v.agent?.recut;
    if (!v.agent || !recut || recut.approvedAt !== approvedAt) return v;
    return { ...v, agent: { ...v.agent, recut: { reason: recut.reason } } };
  }).catch(() => null);
}
