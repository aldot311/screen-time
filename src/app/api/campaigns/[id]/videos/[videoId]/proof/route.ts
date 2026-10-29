import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { renderProof } from "@/lib/media/proof";
import { byteLimit } from "@/lib/campaign/runner";
import { isBlobUrl, MAX_VIDEO_BYTES } from "@/lib/campaign/schema";
import { getCampaign, getVideo, localFileFromUrl, saveVideoFile, updateVideo } from "@/lib/campaign/store";

export const maxDuration = 120;

/** The report's proof clip: rendered on the first request and kept, then a redirect to the stored MP4. Public, like
 *  the report it is made from; each report renders once. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const { id, videoId } = await ctx.params;
  const video = await getVideo(id, videoId);
  if (!video?.report || video.status !== "done") return Response.json({ error: "No finished report" }, { status: 404 });
  if (video.synthetic) return Response.json({ error: "Preview reports have no real video to render" }, { status: 409 });
  if (video.proofUrl) return Response.redirect(new URL(video.proofUrl, _req.url), 302);

  const work = await mkdtemp(join(tmpdir(), "st-proof-"));
  try {
    let source = localFileFromUrl(video.videoUrl);
    if (!source) {
      if (!isBlobUrl(video.videoUrl, id)) return Response.json({ error: "The video is not in this campaign's store" }, { status: 409 });
      const res = await fetch(video.videoUrl, { redirect: "error" });
      if (!res.ok || !res.body) return Response.json({ error: `Could not read the video (${res.status})` }, { status: 502 });
      source = join(work, "source.mp4");
      await pipeline(Readable.fromWeb(res.body as NodeReadableStream), byteLimit(MAX_VIDEO_BYTES), createWriteStream(source));
    }
    const out = join(work, "proof.mp4");
    const brand = (await getCampaign(id))?.brand ?? "";
    await renderProof(source, out, video.report, { brand, creator: video.creator }, work);
    const url = await saveVideoFile(id, videoId, new Uint8Array(await readFile(out)), "video/mp4", "proof");
    await updateVideo(id, videoId, (v) => ({ ...v, proofUrl: url }));
    return Response.redirect(new URL(url, _req.url), 302);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not render the proof clip" }, { status: 500 });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

