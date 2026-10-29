import { z } from "zod";
import { Fee } from "@/lib/campaign/schema";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { getCampaign, listVideos, updateCampaign } from "@/lib/campaign/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  return Response.json({ campaign, videos: await listVideos(id) });
}

const Patch = z.object({ fee: Fee.nullable() });

/** Sets the campaign's fee per video (behind the demo password): { fee: 300 }, or { fee: null } to clear it. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === PREVIEW_ID) return Response.json({ error: "The preview campaign is read-only" }, { status: 409 });
  const parsed = Patch.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "Enter a fee from $0 to $1,000,000" }, { status: 400 });
  const fee = parsed.data.fee;
  const updated = await updateCampaign(id, (c) => {
    const next = { ...c, fee: fee ?? undefined };
    if (fee === null) delete next.fee;
    return next;
  });
  return updated ? Response.json(updated) : Response.json({ error: "Campaign not found" }, { status: 404 });
}
