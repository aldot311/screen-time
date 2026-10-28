import { after } from "next/server";
import { executeRun, startRun } from "@/lib/campaign/runner";

// The pipeline runs after the response, inside this function's time limit (RUN_MAX_SECONDS).
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const { id, videoId } = await ctx.params;
  const start = await startRun(id, videoId);
  if (!start.ok) return Response.json({ error: start.error }, { status: start.status });
  after(() => executeRun(start.campaign, start.video));
  return Response.json(start.video, { status: 202 });
}
