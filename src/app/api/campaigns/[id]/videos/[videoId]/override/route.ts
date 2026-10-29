import { z } from "zod";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { getVideo, updateVideo } from "@/lib/campaign/store";

type Ctx = { params: Promise<{ id: string; videoId: string }> };

const Body = z.object({ decision: z.enum(["pay", "hold"]), reason: z.string().trim().min(3).max(500) });

async function finished(id: string, videoId: string) {
  if (id === PREVIEW_ID) return Response.json({ error: "The preview campaign is read-only" }, { status: 409 });
  const video = await getVideo(id, videoId);
  if (!video) return Response.json({ error: "Video not found" }, { status: 404 });
  if (video.status !== "done" || !video.report) return Response.json({ error: "Only a finished report can be decided differently" }, { status: 409 });
  return null;
}

/** A manager's own decision (behind the demo password): { decision: "pay" | "hold", reason }. The report's result is
 *  kept unchanged beside it. */
export async function POST(req: Request, ctx: Ctx) {
  const { id, videoId } = await ctx.params;
  const refused = await finished(id, videoId);
  if (refused) return refused;
  const parsed = Body.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) return Response.json({ error: "Choose pay or hold and write a short reason" }, { status: 400 });
  const override = { ...parsed.data, at: new Date().toISOString() };
  const updated = await updateVideo(id, videoId, (v) => ({ ...v, override }));
  return updated ? Response.json(updated) : Response.json({ error: "Video not found" }, { status: 404 });
}

/** Removes the override, so the recommendation stands again. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, videoId } = await ctx.params;
  const refused = await finished(id, videoId);
  if (refused) return refused;
  const updated = await updateVideo(id, videoId, (v) => {
    const next = { ...v };
    delete next.override;
    return next;
  });
  return updated ? Response.json(updated) : Response.json({ error: "Video not found" }, { status: 404 });
}
