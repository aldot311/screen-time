import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractFrameJpeg } from "@/lib/media";
import type { VideoReport } from "@/lib/types";
import { saveImageFile } from "./store";
import type { VideoEntry } from "./types";

type Detections = NonNullable<VideoReport["detections"]>;

/**
 * Saves the stills the UI shows next to a finished report: a thumbnail at the moment the brand's product was
 * largest on screen, and a crop of every tracked object at its largest. `videoPath` is the normalized video the
 * report's frames and boxes refer to.
 */
export async function saveVisuals(
  campaignId: string,
  videoId: string,
  videoPath: string,
  report: VideoReport,
  workDir: string,
): Promise<Pick<VideoEntry, "thumbUrl" | "cropUrls">> {
  // Only frames inside the video: the metrics ignore any SAM reports past the end, and ffmpeg cannot extract them.
  const detections = (report.detections ?? []).filter((d) => d.frame < report.info.frameCount);
  const largest = largestPerObject(detections);
  const matched = [...largest.values()].filter((d) => d.verdict === "match");
  const hero = matched.reduce<Detections[number] | null>((b, d) => (!b || d.areaFraction > b.areaFraction ? d : b), null);
  const thumbFrame = hero?.frame ?? Math.floor(report.info.frameCount / 2);

  const still = async (name: string, frame: number, box?: Detections[number]["box"]) => {
    const out = await extractFrameJpeg(videoPath, frame, join(workDir, `${videoId}-${name}.jpg`), box, 0.3);
    return saveImageFile(campaignId, videoId, name, new Uint8Array(await readFile(out)));
  };

  const thumbUrl = await still("thumb", thumbFrame);
  const cropUrls: Record<string, string> = {};
  for (const [objectId, d] of largest) cropUrls[objectId] = await still(`crop-${objectId}`, d.frame, d.box);
  return { thumbUrl, cropUrls };
}

/** Each object's detection with the largest area, in objectId order. */
export function largestPerObject(detections: Detections): Map<number, Detections[number]> {
  const out = new Map<number, Detections[number]>();
  for (const d of detections) {
    const best = out.get(d.objectId);
    if (!best || d.areaFraction > best.areaFraction) out.set(d.objectId, d);
  }
  return new Map([...out].sort(([a], [b]) => a - b));
}
