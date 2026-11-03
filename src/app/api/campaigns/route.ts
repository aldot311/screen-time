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
  const campaign: Campaign = { id: await freeCampaignId(parsed.data.name), ...parsed.data, createdAt: new Date().toISOString() };
  return Response.json(await putCampaign(campaign), { status: 201 });
}
