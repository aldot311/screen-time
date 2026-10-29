import { z } from "zod";
import { Creator, Fee } from "@/lib/campaign/schema";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { getCampaign, updateCampaign } from "@/lib/campaign/store";
import { addCreators, removeCreator, setCreatorFee } from "@/lib/campaign/roster";

const Add = z.object({ handles: z.array(Creator).min(1).max(50) });
const Remove = z.object({ handle: Creator });
const SetFee = z.object({ handle: Creator, fee: Fee.nullable() });

async function editable(id: string) {
  if (id === PREVIEW_ID) return Response.json({ error: "The preview campaign is read-only" }, { status: 409 });
  const campaign = await getCampaign(id);
  return campaign ?? Response.json({ error: "Campaign not found" }, { status: 404 });
}

/** Adds creators to the roster (behind the demo password): { handles: ["@maya", "leo"] }, 1-50, deduplicated
 *  case-insensitively against each other and the roster. Returns the updated Campaign. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const campaign = await editable((await ctx.params).id);
  if (campaign instanceof Response) return campaign;
  const parsed = Add.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "Enter 1 to 50 creator handles" }, { status: 400 });
  const updated = await updateCampaign(campaign.id, (c) => addCreators(c, parsed.data.handles));
  return updated ? Response.json(updated) : Response.json({ error: "Campaign not found" }, { status: 404 });
}

/** Removes one creator: { handle }. Removing a handle not on the roster changes nothing. Returns the Campaign. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const campaign = await editable((await ctx.params).id);
  if (campaign instanceof Response) return campaign;
  const parsed = Remove.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "Name the creator to remove" }, { status: 400 });
  const updated = await updateCampaign(campaign.id, (c) => removeCreator(c, parsed.data.handle));
  return updated ? Response.json(updated) : Response.json({ error: "Campaign not found" }, { status: 404 });
}

/** Sets one creator's fee per video: { handle, fee: 300 }, or { handle, fee: null } to fall back to the campaign's. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const campaign = await editable((await ctx.params).id);
  if (campaign instanceof Response) return campaign;
  const parsed = SetFee.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "Enter a fee from $0 to $1,000,000" }, { status: 400 });
  const { handle, fee } = parsed.data;
  const updated = await updateCampaign(campaign.id, (c) => setCreatorFee(c, handle, fee));
  return updated ? Response.json(updated) : Response.json({ error: "Campaign not found" }, { status: 404 });
}
