// Request bodies the campaign API accepts.
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
// Blank lines from a textarea are dropped rather than rejected.
const lines = (max: number, maxItems: number) =>
  z
    .array(z.string().trim().max(max))
    .max(maxItems)
    .transform((xs) => xs.filter(Boolean));

export const NewCampaign = z.object({
  name: text(120),
  brand: text(80),
  prompt: text(60), // SAM concept prompt: a short noun phrase
  productDescription: text(400),
  brandTerms: lines(60, 20),
  contractTerms: lines(300, 20),
});
export type NewCampaign = z.infer<typeof NewCampaign>;

export const VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** The image type its first bytes say it is (JPEG, PNG or WebP), or null: the declared type is the uploader's word. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => bytes[i + k] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** Brand uploads of the product photo straight to Blob: campaigns/<id>/files/product-<name>.jpg|png|webp. */
export const PRODUCT_UPLOAD_RE = /^campaigns\/([^/]+)\/files\/product-[\w.-]+\.(jpg|jpeg|png|webp)$/i;

export const Creator = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((s) => (s.startsWith("@") ? s : `@${s}`));

/** A video the browser already uploaded to Vercel Blob with a client token from /api/blob-upload. */
export const RegisterVideo = z.object({
  url: z.url().refine((u) => isBlobUrl(u), "Must be a URL in this app's Blob store"),
  creator: Creator,
  title: z.string().trim().max(200).optional(),
});

/**
 * The public host of this deployment's own Blob store, from BLOB_STORE_HOST or the store id inside
 * BLOB_READ_WRITE_TOKEN (vercel_blob_rw_<storeId>_<secret>). Null when no store is configured.
 */
export function ownBlobHost(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.BLOB_STORE_HOST) return env.BLOB_STORE_HOST.toLowerCase();
  const storeId = env.BLOB_READ_WRITE_TOKEN?.split("_")[3];
  return storeId ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

/**
 * Only https URLs in our own Blob store, under this campaign's folder, are fetched server-side, so a
 * client cannot make a run download from someone else's store or any other host.
 */
export function isBlobUrl(url: string, campaignId?: string, env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    const u = new URL(url);
    const host = ownBlobHost(env);
    if (u.protocol !== "https:" || u.username || u.password || !host || u.hostname !== host) return false;
    return campaignId === undefined || u.pathname.startsWith(`/campaigns/${campaignId}/`);
  } catch {
    return false;
  }
}
