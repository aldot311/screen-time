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
import { createDoc, getCampaign, getVideo, localFileFromUrl, saveVideoFile, updateVideo } from "@/lib/campaign/store";
import type { VideoReport } from "@/lib/types";

export const maxDuration = 120;

const LOCK_MS = 3 * 60 * 1000;

/** A short id for one report: its run id when it has a receipt, else a hash of what the clip draws. */
function reportKey(r: VideoReport): string {
  const basis = r.receipt?.runId ?? JSON.stringify([r.videoId, r.metrics.secondsOnScreen, r.metrics.segments, r.terms.map((t) => t.pass)]);
  let h = 2166136261;
  for (let i = 0; i < basis.length; i++) h = Math.imul(h ^ basis.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** The report's proof clip: rendered on the first request and kept, then a redirect to the stored MP4. Public on
 *  purpose, like the report it is made from (it is for sharing without the password); a lock keeps it to one render
 *  per report at a time, and each report renders once. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; videoId: string }> }) {
  const { id, videoId } = await ctx.params;
  const video = await getVideo(id, videoId);
  if (!video?.report || video.status !== "done") return Response.json({ error: "No finished report" }, { status: 404 });
  if (video.synthetic) return Response.json({ error: "Preview reports have no real video to render" }, { status: 409 });
  if (video.proofUrl) return Response.redirect(new URL(video.proofUrl, _req.url), 302);

  // One render per report at a time: a burst of requests renders once and the rest are asked to come back. The lock
  // window is three minutes, so a render that died does not block the next one for long.
  const key = reportKey(video.report);
  const window = Math.floor(Date.now() / LOCK_MS);
  if (!(await createDoc(`proof-locks/${id}/${videoId}-${key}-${window}.json`, { at: new Date().toISOString() })))
    return Response.json({ error: "The proof clip is rendering. Try again in a few seconds." }, { status: 202, headers: { "Retry-After": "5" } });

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
    // Named after the report it shows, and recorded only if the video still has that report and no clip yet: a re-run
    // that finished meanwhile never gets an old proof.
    const url = await saveVideoFile(id, videoId, new Uint8Array(await readFile(out)), "video/mp4", `proof-${key}`);
    const saved = await updateVideo(id, videoId, (v) =>
      v.status === "done" && v.report && reportKey(v.report) === key && !v.proofUrl ? { ...v, proofUrl: url } : v,
    );
    return Response.redirect(new URL(saved?.proofUrl ?? url, _req.url), 302);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not render the proof clip" }, { status: 500 });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

