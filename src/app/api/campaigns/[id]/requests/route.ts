import { z } from "zod";
import { Creator } from "@/lib/campaign/schema";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { getCampaign, updateCampaign } from "@/lib/campaign/store";
import { linkSecret } from "@/lib/campaign/requests";
import { issueRequest, recordRequest } from "@/lib/campaign/roster";

const Body = z.object({ creator: Creator });

/**
 * Makes a link a creator can open to send their video for this campaign (behind the demo password, via the proxy),
 * and records it on the creator's roster entry (adding them if needed). The link is returned once and never stored.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === PREVIEW_ID) return Response.json({ error: "The preview campaign is read-only" }, { status: 409 });
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "Enter the creator's handle" }, { status: 400 });
  const secret = linkSecret();
  if (!secret) return Response.json({ error: "Request links are switched off on this deployment." }, { status: 503 });

  const issued = await issueRequest(id, parsed.data.creator, secret);
  await updateCampaign(id, (c) => recordRequest(c, issued.creator, issued.record));
  return Response.json({ path: issued.path, creator: issued.creator, expiresAt: issued.expiresAt }, { status: 201 });
}
