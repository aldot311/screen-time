import { getVideo } from "@/lib/campaign/store";

// The UI polls this while a run is in progress.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const { id, videoId } = await ctx.params;
  const video = await getVideo(id, videoId);
  if (!video) return Response.json({ error: "Video not found" }, { status: 404 });
  return Response.json(video, { headers: { "Cache-Control": "no-store" } });
}
