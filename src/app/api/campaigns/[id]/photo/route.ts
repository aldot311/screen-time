import { z } from "zod";
import { IMAGE_TYPES, isBlobUrl, MAX_IMAGE_BYTES, PRODUCT_UPLOAD_RE, sniffImageType } from "@/lib/campaign/schema";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { CAMPAIGN_FILES, getCampaign, randomSuffix, saveImageFile, storedFileInfo, updateCampaign } from "@/lib/campaign/store";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const Register = z.object({ url: z.url() });

/**
 * Sets the campaign's product photo (behind the demo password, via the proxy): its cover, and the reference image
 * Muse Spark compares each tracked object against. Two shapes, like video uploads:
 * - multipart/form-data with `file`: a JPEG, PNG or WebP of at most 8 MB, stored by the server.
 * - JSON { url } of a photo the browser already uploaded to Blob through /api/blob-upload, at
 *   campaigns/<id>/files/product-<name>.jpg|png|webp.
 * Returns the updated Campaign.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (id === PREVIEW_ID) return fail(409, "The preview campaign is read-only");
  if (!(await getCampaign(id))) return fail(404, "Campaign not found");

  let url: string;
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const parsed = Register.safeParse(await req.json().catch(() => undefined));
    if (!parsed.success) return fail(400, "Send the uploaded photo's url");
    url = parsed.data.url;
    // Only a product photo in this campaign's own folder, never a video, its JSON or another campaign's file.
    if (!isBlobUrl(url, id) || !PRODUCT_UPLOAD_RE.test(new URL(url).pathname.slice(1))) {
      return fail(400, "The photo must be uploaded to this campaign's folder");
    }
    const info = await storedFileInfo(url);
    if (!info || !(IMAGE_TYPES as readonly string[]).includes(info.contentType) || info.size === 0 || info.size > MAX_IMAGE_BYTES) {
      return fail(400, "The uploaded photo could not be found. Try uploading it again.");
    }
  } else {
    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, "Send multipart/form-data with a file, or JSON with a Blob url");
    const file = form.get("file");
    if (!(file instanceof File)) return fail(400, "Missing the photo file");
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return fail(415, "Upload a JPEG, PNG or WebP photo");
    if (file.size === 0) return fail(400, "That file is empty. Choose the photo again.");
    if (file.size > MAX_IMAGE_BYTES) return fail(413, "The photo is over 8 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Stored and served by what the bytes are, not what the browser called them.
    const type = sniffImageType(bytes);
    if (!type) return fail(415, "That file is not a JPEG, PNG or WebP image");
    url = await saveImageFile(id, CAMPAIGN_FILES, `product-${randomSuffix()}`, bytes, type);
  }

  // Applied to the latest stored campaign, so an edit made while the photo uploaded is kept.
  const updated = await updateCampaign(id, (c) => ({ ...c, productImageUrl: url }));
  return updated ? Response.json(updated) : fail(404, "Campaign not found");
}
