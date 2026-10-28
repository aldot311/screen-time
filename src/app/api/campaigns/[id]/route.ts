import { getCampaign, listVideos } from "@/lib/campaign/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  return Response.json({ campaign, videos: await listVideos(id) });
}
