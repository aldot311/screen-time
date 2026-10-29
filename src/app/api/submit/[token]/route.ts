import { z } from "zod";
import { addVideo, newVideoId } from "@/lib/campaign/add-video";
import { isBlobUrl, MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/lib/campaign/schema";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { claimRequest, getCampaign, releaseRequest, requestUsed, saveVideoFile, storedFileInfo } from "@/lib/campaign/store";
import { consentText, linkSecret, verifyRequestToken } from "@/lib/campaign/requests";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const Register = z.object({ url: z.url(), title: z.string().trim().max(200).optional(), consent: z.literal(true) });

/**
 * A creator sends their video through a request link: the link is the credential (no password), and it allows one
 * video, for its own campaign and creator, after the creator agrees to the analysis. The video waits for the brand
 * to run it. Shapes match POST /api/campaigns/[id]/videos: multipart with `file`, or JSON with a Blob url.
 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const claims = await verifyRequestToken((await ctx.params).token, linkSecret());
  if (!claims) return fail(403, "This link is not valid or has expired. Ask the brand for a new one.");
  const campaign = claims.campaignId === PREVIEW_ID ? null : await getCampaign(claims.campaignId);
  if (!campaign) return fail(404, "This campaign no longer exists.");
  // After the claim: if storing fails, give the link back so the creator can retry.
  const store = async (save: () => Promise<{ id: string }>) => {
    try {
      return Response.json({ id: (await save()).id }, { status: 201 });
    } catch (err) {
      await releaseRequest(claims.nonce).catch(() => undefined);
      throw err;
    }
  };
  const used = () => fail(409, "A video was already sent with this link. Ask the brand for a new link to send another.");
  if (await requestUsed(claims.nonce)) return used();
  const consent = { at: new Date().toISOString(), text: consentText(campaign.brand) };

  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const parsed = Register.safeParse(await req.json().catch(() => undefined));
    if (!parsed.success) return fail(400, "Agree to the analysis and upload an MP4 or MOV video.");
    // Only a video file this campaign's upload route could have issued, never its JSON or another asset.
    const path = new URL(parsed.data.url).pathname;
    if (!isBlobUrl(parsed.data.url, campaign.id) || !new RegExp(`^/campaigns/${campaign.id}/files/[\\w.-]+\\.(mp4|mov)$`, "i").test(path)) {
      return fail(400, "The video must be uploaded to this campaign's folder");
    }
    // The file must really be there, as a video within the size limit: an invented URL must not use up the link.
    const info = await storedFileInfo(parsed.data.url);
    if (!info || !(VIDEO_TYPES as readonly string[]).includes(info.contentType) || info.size === 0 || info.size > MAX_VIDEO_BYTES) {
      return fail(400, "The uploaded video could not be found. Try sending it again.");
    }
    const title = parsed.data.title || decodeURIComponent(path.split("/").at(-1) ?? "video");
    const id = newVideoId(title);
    // The claim is the one-video rule: an atomic create, so two uploads racing through one link cannot both land.
    if (!(await claimRequest(claims.nonce, id))) return used();
    return store(() => addVideo(campaign.id, { id, creator: claims.creator, title, url: parsed.data.url, consent, requestNonce: claims.nonce }));
  }

  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "Send the video as a file upload.");
  if (form.get("consent") !== "true") return fail(400, "Agree to the analysis to send your video.");
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "Missing the video file");
  if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) return fail(415, "Upload an MP4 or MOV video");
  if (file.size > MAX_VIDEO_BYTES) return fail(413, "The video is over 200 MB");
  const title = (file.name || "video").slice(0, 200);
  const id = newVideoId(title);
  if (!(await claimRequest(claims.nonce, id))) return used();
  return store(async () => {
    const url = await saveVideoFile(campaign.id, id, new Uint8Array(await file.arrayBuffer()), file.type);
    return addVideo(campaign.id, { id, creator: claims.creator, title, url, consent, requestNonce: claims.nonce });
  });
}
