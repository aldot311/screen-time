import { Creator, isBlobUrl, MAX_VIDEO_BYTES, RegisterVideo, VIDEO_TYPES } from "@/lib/campaign/schema";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { getCampaign, putVideo, randomSuffix, saveVideoFile, slugify } from "@/lib/campaign/store";
import type { VideoEntry } from "@/lib/campaign/types";

const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Adds one video to a campaign, in one of two shapes:
 * - multipart/form-data with `file` (mp4 or mov) and `creator`, stored by the server. On Vercel a request body is
 *   capped at about 4.5 MB, so larger files go straight to Blob through /api/blob-upload first.
 * - JSON { url, creator, title? } registering a video already uploaded to Blob that way.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === PREVIEW_ID) return fail(409, "The preview campaign is read-only");
  const campaign = await getCampaign(id);
  if (!campaign) return fail(404, "Campaign not found");

  const videoId = (title: string) => `${slugify(title.replace(/\.[^.]+$/, ""), 32)}-${randomSuffix()}`;
  const entry = (vid: string, creator: string, title: string, url: string): VideoEntry => {
    const now = new Date().toISOString();
    return {
      id: vid, campaignId: id, creator, title, videoUrl: url, sourceUrl: url,
      status: "uploaded", step: null, createdAt: now, updatedAt: now,
    };
  };

  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const parsed = RegisterVideo.safeParse(await req.json().catch(() => undefined));
    if (!parsed.success) return Response.json({ error: "Invalid video", issues: parsed.error.issues }, { status: 400 });
    const { url, creator } = parsed.data;
    if (!isBlobUrl(url, id)) return fail(400, "The video must be uploaded to this campaign's folder");
    const title = parsed.data.title || decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? "video");
    return Response.json(await putVideo(entry(videoId(title), creator, title, url)), { status: 201 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "Send multipart/form-data with a file, or JSON with a Blob url");
  const file = form.get("file");
  const creator = Creator.safeParse(form.get("creator") ?? "");
  if (!(file instanceof File)) return fail(400, "Missing the video file");
  if (!creator.success) return fail(400, "Missing the creator handle");
  if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) return fail(415, "Upload an MP4 or MOV video");
  if (file.size > MAX_VIDEO_BYTES) return fail(413, "The video is over 200 MB");

  const title = String(form.get("title") ?? "").trim().slice(0, 200) || file.name || "video";
  const vid = videoId(title);
  const url = await saveVideoFile(id, vid, new Uint8Array(await file.arrayBuffer()), file.type);
  return Response.json(await putVideo(entry(vid, creator.data, title, url)), { status: 201 });
}
