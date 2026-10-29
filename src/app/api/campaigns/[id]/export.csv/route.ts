import { campaignCsv } from "@/lib/campaign/csv";
import { getCampaign, listVideos } from "@/lib/campaign/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });
  return new Response(campaignCsv(await listVideos(id), campaign), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // The id is a validated slug, so it is safe inside the quoted file name.
      "Content-Disposition": `attachment; filename="${campaign.id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
