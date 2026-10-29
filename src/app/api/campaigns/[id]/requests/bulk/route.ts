import { z } from "zod";
import { Creator } from "@/lib/campaign/schema";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { getCampaign, listVideos, updateCampaign } from "@/lib/campaign/store";
import { linkSecret } from "@/lib/campaign/requests";
import { creatorsWithoutVideo, issueRequest, recordRequest, sameHandle } from "@/lib/campaign/roster";

const Body = z.object({ creators: z.array(Creator).min(1).max(50).optional() });

/**
 * One request link per creator (behind the demo password, via the proxy): the creators named, or by default every
 * roster creator who has not sent a video yet. Each link is recorded on the roster like a single request, and the
 * links themselves are returned once and never stored. Response: [{ creator, path, expiresAt }].
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === PREVIEW_ID) return Response.json({ error: "The preview campaign is read-only" }, { status: 409 });
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  // An empty body means "everyone still due".
  const raw = await req.text();
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Send up to 50 creator handles, or none for everyone still due" }, { status: 400 });
  const secret = linkSecret();
  if (!secret) return Response.json({ error: "Request links are switched off on this deployment." }, { status: 503 });

  const wanted = parsed.data.creators ?? creatorsWithoutVideo(campaign, await listVideos(id));
  const handles = wanted.filter((h, i) => wanted.findIndex((x) => sameHandle(x, h)) === i);
  const issued = await Promise.all(handles.map((h) => issueRequest(id, h, secret)));
  if (issued.length) await updateCampaign(id, (c) => issued.reduce((acc, r) => recordRequest(acc, r.creator, r.record), c));
  return Response.json(
    issued.map(({ creator, path, expiresAt }) => ({ creator, path, expiresAt })),
    { status: 201 },
  );
}
