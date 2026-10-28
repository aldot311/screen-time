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
