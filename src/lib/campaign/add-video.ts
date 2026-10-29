import { putVideo, randomSuffix, slugify } from "./store";
import type { VideoEntry } from "./types";

/** A new video id from its title: a readable slug plus a random suffix, so two uploads of clip.mp4 never collide. */
export const newVideoId = (title: string) => `${slugify(title.replace(/\.[^.]+$/, ""), 32)}-${randomSuffix()}`;

/** Stores a just-uploaded video, waiting for the brand to run it. */
export function addVideo(
  campaignId: string,
  v: { id: string; creator: string; title: string; url: string } & Pick<VideoEntry, "consent" | "requestNonce">,
): Promise<VideoEntry> {
  const now = new Date().toISOString();
  return putVideo({
    id: v.id,
    campaignId,
    creator: v.creator,
    title: v.title,
    videoUrl: v.url,
    sourceUrl: v.url,
    status: "uploaded",
    step: null,
    createdAt: now,
    updatedAt: now,
    ...(v.consent ? { consent: v.consent } : {}),
    ...(v.requestNonce ? { requestNonce: v.requestNonce } : {}),
  });
}
