import { z } from "zod";
import { Fee } from "@/lib/campaign/schema";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { openWeightConfig } from "@/lib/meta/open-weight";
import { getCampaign, listVideos, updateCampaign } from "@/lib/campaign/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  return Response.json({ campaign, videos: await listVideos(id) });
}

const Patch = z.union([z.object({ fee: Fee.nullable() }).strict(), z.object({ checkEngine: z.enum(["open", "hosted"]) }).strict()]);

/** Sets the campaign's fee per video, { fee: 300 } or { fee: null } to clear it, or which model checks each tracked
 *  object, { checkEngine: "open" | "hosted" } (behind the demo password). */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === PREVIEW_ID) return Response.json({ error: "The preview campaign is read-only" }, { status: 409 });
  const parsed = Patch.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "Enter a fee from $0 to $1,000,000" }, { status: 400 });
  const data = parsed.data;
  if ("checkEngine" in data && data.checkEngine === "open" && !openWeightConfig())
    return Response.json({ error: "Muse Spark Open is not set up on this deployment" }, { status: 409 });
  const updated = await updateCampaign(id, (c) => {
    const next = { ...c };
    if ("fee" in data) {
      if (data.fee === null) delete next.fee;
      else next.fee = data.fee;
    } else if (data.checkEngine === "open") next.checkEngine = "open";
    else delete next.checkEngine;
    return next;
  });
  return updated ? Response.json(updated) : Response.json({ error: "Campaign not found" }, { status: 404 });
}
