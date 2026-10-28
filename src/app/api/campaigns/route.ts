import { connection } from "next/server";
import { NewCampaign } from "@/lib/campaign/schema";
import { getCampaign, listCampaigns, putCampaign, randomSuffix, slugify } from "@/lib/campaign/store";
import { PREVIEW_ID } from "@/lib/campaign/preview";
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
  const campaign: Campaign = { id: await freeId(parsed.data.name), ...parsed.data, createdAt: new Date().toISOString() };
  return Response.json(await putCampaign(campaign), { status: 201 });
}

async function freeId(name: string): Promise<string> {
  const slug = slugify(name);
  if (slug !== PREVIEW_ID && !(await getCampaign(slug))) return slug;
  return `${slugify(name, 40)}-${randomSuffix()}`;
}
