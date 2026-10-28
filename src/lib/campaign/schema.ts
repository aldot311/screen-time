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
  url: z.url().refine(isBlobUrl, "Must be a Vercel Blob URL"),
  creator: Creator,
  title: z.string().trim().max(200).optional(),
});

/** Only our Blob store's https URLs are fetched server-side, so a client cannot make the run download anything else. */
export function isBlobUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com") && !u.username && !u.password;
  } catch {
    return false;
  }
}
