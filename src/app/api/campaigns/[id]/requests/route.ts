import { z } from "zod";
import { Creator } from "@/lib/campaign/schema";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { getCampaign } from "@/lib/campaign/store";
import { createRequestToken, linkSecret, newNonce, REQUEST_TTL_DAYS } from "@/lib/campaign/requests";

const Body = z.object({ creator: Creator });

/** Makes a link a creator can open to send their video for this campaign (behind the demo password, via the proxy). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === PREVIEW_ID) return Response.json({ error: "The preview campaign is read-only" }, { status: 409 });
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "Enter the creator's handle" }, { status: 400 });
  const secret = linkSecret();
  if (!secret) return Response.json({ error: "Request links are switched off on this deployment." }, { status: 503 });

  const exp = Math.floor(Date.now() / 1000) + REQUEST_TTL_DAYS * 86400;
  const token = await createRequestToken({ campaignId: id, creator: parsed.data.creator, exp, nonce: newNonce() }, secret);
  return Response.json({ path: `/submit/${token}`, creator: parsed.data.creator, expiresAt: new Date(exp * 1000).toISOString() }, { status: 201 });
}
