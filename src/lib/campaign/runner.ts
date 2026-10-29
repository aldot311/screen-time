// Runs one stored video through the pipeline, writing status, step, error and report back to the store as it goes.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { API_KEY_ENV } from "@/lib/meta/http";
import { CostGuard } from "@/lib/meta";
import { runVideo } from "@/lib/pipeline/run";
import { isBlobUrl, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, sniffImageType } from "./schema";
import { saveVisuals } from "./visuals";
import { PREVIEW_ID } from "./preview";
import { getCampaign, getVideo, localFileFromUrl, putVideo, saveVideoFile, withLedgerFile } from "./store";
import type { Campaign, VideoEntry } from "./types";

/** The run route's maxDuration; a "running" entry untouched for longer than this plus a margin was killed mid-run. */
export const RUN_MAX_SECONDS = 300;
const STALE_MS = (RUN_MAX_SECONDS + 60) * 1000;

export function usdFromEnv(value: string | undefined, fallback: number): number {
  const n = value === undefined || value.trim() === "" ? NaN : Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const budget = () => ({
  maxUsdPerRun: usdFromEnv(process.env.SCREEN_TIME_MAX_USD_PER_VIDEO, 0.5),
  maxUsdTotal: usdFromEnv(process.env.SCREEN_TIME_MAX_USD_TOTAL, 20),
});

export type StartResult =
  | { ok: true; campaign: Campaign; video: VideoEntry }
  | { ok: false; status: number; error: string };

const isStale = (v: VideoEntry, now: number) => now - Date.parse(v.updatedAt) > STALE_MS;

/**
 * Checks a run may start and marks the video running. The read and write are not atomic, so two requests in the
 * same instant could both start; the per-video cost cap still bounds what that costs.
 */
export async function startRun(campaignId: string, videoId: string, now = Date.now()): Promise<StartResult> {
  if (campaignId === PREVIEW_ID) {
    return { ok: false, status: 409, error: "The preview campaign is synthetic and cannot be run" };
  }
  if (!process.env[API_KEY_ENV]) return { ok: false, status: 503, error: "The Meta API key is not configured" };
  const campaign = await getCampaign(campaignId);
  if (!campaign) return { ok: false, status: 404, error: "Campaign not found" };
  const video = await getVideo(campaignId, videoId);
  if (!video) return { ok: false, status: 404, error: "Video not found" };
  if (video.status === "running" && !isStale(video, now)) {
    return { ok: false, status: 409, error: "This video is already running" };
  }
  const running = await putVideo({
    ...video,
    sourceUrl: video.sourceUrl ?? video.videoUrl,
    status: "running",
    step: "normalize",
    error: undefined,
    report: undefined,
  });
  return { ok: true, campaign, video: running };
}

/** Runs the pipeline for a video startRun accepted. Never throws: failures are written to the entry. */
export async function executeRun(campaign: Campaign, video: VideoEntry): Promise<VideoEntry> {
  let current = video;
  const workDir = await mkdtemp(join(tmpdir(), `st-${video.id}-`));
  try {
    const sourcePath = await localSource(video.sourceUrl ?? video.videoUrl, workDir, campaign.id);
    const productImageUrl = await productPhoto(campaign);
    const report = await withLedgerFile((ledgerPath) =>
      runVideo({
        videoId: video.id,
        sourcePath,
        workDir,
        prompt: campaign.prompt,
        productDescription: campaign.productDescription,
        brandTerms: campaign.brandTerms,
        contractTerms: campaign.contractTerms,
        productImageUrl,
        productImageSource: productImageUrl ? campaign.productImageUrl : undefined,
        guard: new CostGuard({ ...budget(), ledgerPath }),
        onStep: async (step) => {
          // Tracking starts right after normalization, so the normalized copy is complete here.
          if (step === "track") {
            const normalized = createReadStream(join(workDir, `${video.id}.mp4`));
            current = { ...current, videoUrl: await saveVideoFile(campaign.id, video.id, normalized, "video/mp4", "normalized") };
          }
          current = await putVideo({ ...current, step });
        },
      }),
    );
    // Save the paid-for report first; stills are nice to have and are added afterwards if they work.
    current = await putVideo({ ...current, status: "done", report, error: undefined });
    try {
      const visuals = await saveVisuals(campaign.id, video.id, join(workDir, `${video.id}.mp4`), report, workDir);
      current = await putVideo({ ...current, ...visuals });
    } catch {
      // No thumbnail or crops; the report stands.
    }
    return current;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return putVideo({ ...current, status: "failed", error }).catch(() => current);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/**
 * The campaign's product photo as a data URL for Muse Spark, read from the local store or this campaign's Blob
 * folder. Undefined when there is none or it cannot be read: the run then checks against the description alone.
 */
export async function productPhoto(campaign: Campaign): Promise<string | undefined> {
  const url = campaign.productImageUrl;
  if (!url) return undefined;
  try {
    let bytes: Uint8Array;
    const local = localFileFromUrl(url);
    if (local) bytes = new Uint8Array(await readFile(local));
    else if (isBlobUrl(url, campaign.id)) {
      const res = await fetch(url, { redirect: "error" });
      if (!res.ok || Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) return undefined;
      bytes = new Uint8Array(await res.arrayBuffer());
    } else return undefined;
    const type = bytes.length <= MAX_IMAGE_BYTES ? sniffImageType(bytes) : null;
    return type ? `data:${type};base64,${Buffer.from(bytes).toString("base64")}` : undefined;
  } catch {
    return undefined;
  }
}

/** A local path for the source video, downloading it into workDir when it lives in Blob. */
async function localSource(url: string, workDir: string, campaignId: string): Promise<string> {
  const local = localFileFromUrl(url);
  if (local) return local;
  if (!isBlobUrl(url, campaignId)) throw new Error("The video's source is not in this campaign's store");
  const res = await fetch(url, { redirect: "error" });
  if (!res.ok || !res.body) throw new Error(`Could not download the video (${res.status})`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_VIDEO_BYTES) throw new Error("The video is over 200 MB");
  // Not named <videoId>.mp4: runVideo writes the normalized copy under that name in the same folder.
  const path = join(workDir, "source-upload");
  // Count bytes as they arrive: Content-Length can be absent or wrong.
  await pipeline(Readable.fromWeb(res.body as NodeReadableStream), byteLimit(MAX_VIDEO_BYTES), createWriteStream(path));
  return path;
}

export function byteLimit(max: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      seen += chunk.length;
      done(seen > max ? new Error("The video is over 200 MB") : null, chunk);
    },
  });
}
