import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/lib/campaign/schema";
import { PREVIEW_ID } from "@/lib/campaign/preview";
import { getCampaign, isValidId, requestUsed, takeUploadSlot, usingBlob } from "@/lib/campaign/store";
import { ACCESS_COOKIE, accessError, decideAccess } from "@/lib/access";
import { linkSecret, verifyRequestToken } from "@/lib/campaign/requests";
import { requestFilePrefix } from "@/lib/campaign/upload-name";
import { cookies } from "next/headers";

/**
 * Issues client-upload tokens so the browser can send videos over 4 MB straight to Blob. The client uploads to
 * campaigns/<campaignId>/files/<name>.mp4|.mov, then registers the returned URL with
 * POST /api/campaigns/<campaignId>/videos (JSON).
 */
export async function POST(req: Request) {
  if (!usingBlob()) return Response.json({ error: "Blob storage is not configured" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return Response.json({ error: "Invalid upload request" }, { status: 400 });
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const m = /^campaigns\/([^/]+)\/files\/[\w.-]+\.(mp4|mov)$/i.exec(pathname);
        const campaignId = m?.[1] ?? "";
        // Token requests come from the browser: the brand's carry the demo-password cookie, a creator's carry the
        // signed request link as clientPayload, which only allows its own campaign.
        const access = await decideAccess((await cookies()).get(ACCESS_COOKIE)?.value);
        let creatorUpload = false;
        if (access !== "allow") {
          const claims = clientPayload ? await verifyRequestToken(clientPayload, linkSecret()) : null;
          if (!claims || claims.campaignId !== campaignId) throw new AccessRefused(access);
          // The file is named after the link, so /api/submit accepts only files uploaded with this link.
          if (!pathname.startsWith(`campaigns/${campaignId}/files/${requestFilePrefix(claims.nonce)}`)) {
            throw new Error("Upload path does not match this request link");
          }
          creatorUpload = true;
          // A used link gets no more upload tokens, so it cannot be replayed to fill the store.
          if (await requestUsed(claims.nonce)) throw new Error("A video was already sent with this link");
          if (!(await takeUploadSlot(claims.nonce))) throw new Error("Too many upload attempts with this link. Ask the brand for a new one.");
        }
        if (!isValidId(campaignId) || campaignId === PREVIEW_ID || !(await getCampaign(campaignId))) {
          throw new Error("Upload path must be campaigns/<campaign id>/files/<name>.mp4 for an existing campaign");
        }
        return {
          allowedContentTypes: [...VIDEO_TYPES],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
          // A creator's token is short-lived: with three per link, a replayed token cannot keep filling the store.
          ...(creatorUpload ? { validUntil: Date.now() + 10 * 60_000 } : {}),
        };
      },
      // The client registers the video itself; this callback only reaches deployed URLs anyway.
      onUploadCompleted: async () => undefined,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof AccessRefused) return accessError(err.decision);
    return Response.json({ error: err instanceof Error ? err.message : "Upload refused" }, { status: 400 });
  }
}

class AccessRefused extends Error {
  constructor(readonly decision: "locked" | "disabled") {
    super("access refused");
  }
}
