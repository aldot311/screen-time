import { connection } from "next/server";
import { NewCampaign } from "@/lib/campaign/schema";
import { freeCampaignId, listCampaigns, putCampaign } from "@/lib/campaign/store";
import type { Campaign } from "@/lib/campaign/types";

export async function GET() {
  await connection(); // read the store per request, never at build time
  return Response.json(await listCampaigns());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => undefined);
  const parsed = NewCampaign.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid campaign", issues: parsed.error.issues }, { status: 400 });
  }
  // With no spoken names the transcript is searched for nothing, so a "say the brand" term could only fail: listen for
  // the brand itself instead.
  const brandTerms = parsed.data.brandTerms.length ? parsed.data.brandTerms : [parsed.data.brand];
  const campaign: Campaign = { id: await freeCampaignId(parsed.data.name), ...parsed.data, brandTerms, createdAt: new Date().toISOString() };
  return Response.json(await putCampaign(campaign), { status: 201 });
}
