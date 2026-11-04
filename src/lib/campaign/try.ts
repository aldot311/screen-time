// "Try a sample video": anyone can run the real pipeline on one fixed sample Reel, without the demo password. It
// spends real Meta credits, so it is fenced four ways: a visitor (hashed IP; an IPv6 address by its /64) gets a few
// runs a day, everyone together gets a daily cap, while a sample run is in progress new visitors join it instead of
// starting another, and no run starts into the budget kept for the demo password (runner.ts ownerReserveUsd). The
// per-video and total budget caps of every run still apply. Past a limit, the newest finished run is shown instead.
import { readFile } from "node:fs/promises";
import { linkSecret } from "./requests";
import { newVideoId } from "./add-video";
import { isBlobUrl, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, sniffImageType } from "./schema";
import {
  CAMPAIGN_FILES,
  createDoc,
  getCampaign,
  getVideo,
  ledgerSpentUsd,
  listVideos,
  localFileFromUrl,
  putCampaign,
  putVideo,
  readDoc,
  saveImageFile,
  saveVideoFile,
  takeSlot,
} from "./store";
import { budget, openRunFits, usdFromEnv } from "./runner";
import { clientKey } from "@/lib/client-ip";
import type { Campaign, VideoEntry } from "./types";

// A new id and cache key for each new sample: an existing try campaign and its cached copy are reused as they are, so
// reusing the old ones would keep running the old clip against the old brief. The old "try-a-sample" is archived.
export const TRY_ID = "try-lacroix";
/** The sample: Ash's 15-second LaCroix Reel (her re-cut), the same run as the pre-made pay report. */
const SOURCE = { campaignId: "lacroix-strawberry-peach", videoId: "ash-recut" };
/** The store document recording where the sample's copy lives inside the try campaign. */
const SAMPLE_DOC = "try/lacroix-sample.json";
/** A running sample untouched this long is treated as dead, and a new one may start. */
const JOIN_MS = 2 * 60 * 1000;

export const tryLimits = (env: Record<string, string | undefined> = process.env) => ({
  perVisitor: Math.floor(usdFromEnv(env.SCREEN_TIME_TRY_PER_VISITOR, 3)),
  perDay: Math.floor(usdFromEnv(env.SCREEN_TIME_TRY_PER_DAY, 25)),
});

/** Which limit sent a visitor to a replay. Links carry this code, never free text. */
export type TryLimit = "visitor" | "day" | "budget";

export const TRY_LIMIT_TEXT: Record<TryLimit, (n: number) => string> = {
  visitor: (n) => `You have run the sample ${n} times today.`,
  day: (n) => `Today's ${n} sample runs are used up.`,
  budget: () => "The free sample runs for this demo are used up.",
};

export type TryResult =
  | { mode: "started" | "joined" | "replay"; video: VideoEntry; reason?: string; limit?: TryLimit }
  | { mode: "unavailable"; status: number; error: string };

async function visitorKey(ip: string): Promise<string> {
  const salt = linkSecret() ?? "screen-time-try";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`try-v1:${salt}:${clientKey(ip)}`));
  return Buffer.from(digest).toString("hex").slice(0, 24);
}

/** Reads a file of the source campaign (local store, or its own Blob folder only), refusing anything over `max` bytes. */
async function sourceBytes(url: string, what: string, max: number): Promise<Uint8Array> {
  let bytes: Uint8Array;
  const local = localFileFromUrl(url);
  if (local) bytes = new Uint8Array(await readFile(local));
  else if (isBlobUrl(url, SOURCE.campaignId)) {
    const res = await fetch(url, { redirect: "error" });
    if (!res.ok) throw new Error(`Could not read the ${what} (${res.status})`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } else throw new Error(`The ${what} is not in this app's store`);
  if (bytes.length > max) throw new Error(`The ${what} is too large`);
  return bytes;
}

/**
 * The try campaign, created once from the source campaign's brief, fee and product photo, so a sample run checks the
 * same things the pre-made report did. Runs only read a photo from their own campaign's folder, so the photo's bytes
 * are copied in; if that copy fails nothing is created, and the next visitor tries again.
 */
async function ensureCampaign(): Promise<Campaign | null> {
  const existing = await getCampaign(TRY_ID);
  if (existing) return existing;
  const src = await getCampaign(SOURCE.campaignId);
  if (!src) return null;
  let productImageUrl: string | undefined;
  if (src.productImageUrl) {
    const bytes = await sourceBytes(src.productImageUrl, "sample's product photo", MAX_IMAGE_BYTES);
    const type = sniffImageType(bytes);
    if (!type) throw new Error("The sample's product photo is not a JPEG, PNG or WebP image");
    productImageUrl = await saveImageFile(TRY_ID, CAMPAIGN_FILES, "product-photo", bytes, type);
  }
  return putCampaign({
    id: TRY_ID,
    name: `${src.brand}: try it on a sample Reel`,
    brand: src.brand,
    prompt: src.prompt,
    productDescription: src.productDescription,
    brandTerms: src.brandTerms,
    contractTerms: src.contractTerms,
    ...(src.fee !== undefined ? { fee: src.fee } : {}),
    ...(productImageUrl ? { productImageUrl } : {}),
    createdAt: new Date().toISOString(),
  });
}

/** The sample's file inside the try campaign's own folder (runs only read files from their campaign), copied once. */
async function sampleUrl(): Promise<string> {
  const known = await readDoc<{ url: string }>(SAMPLE_DOC);
  if (known?.url) return known.url;
  const src = await getVideo(SOURCE.campaignId, SOURCE.videoId);
  if (!src) throw new Error("The sample video is missing");
  const bytes = await sourceBytes(src.videoUrl, "sample video", MAX_VIDEO_BYTES);
  const url = await saveVideoFile(TRY_ID, "sample", bytes, "video/mp4", "source");
  // Two first visitors may both copy it; the first record wins and both copies are the same file.
  if (await createDoc(SAMPLE_DOC, { url })) return url;
  return (await readDoc<{ url: string }>(SAMPLE_DOC))?.url ?? url;
}

const newest = (videos: VideoEntry[]) => [...videos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/**
 * Starts a sample run, or says which existing one to show. The caller starts the pipeline (startRun/executeRun) when
 * the mode is "started"; the entry is created "uploaded" here.
 */
export async function startTry(ip: string, now = new Date()): Promise<TryResult> {
  const campaign = await ensureCampaign();
  if (!campaign) return { mode: "unavailable", status: 503, error: "The sample is not set up on this deployment." };
  const videos = await listVideos(TRY_ID);
  const live = newest(videos).find((v) => (v.status === "running" || v.status === "uploaded") && now.getTime() - Date.parse(v.updatedAt) < JOIN_MS);
  if (live) return { mode: "joined", video: live };
  // The sample's own copy of the video, made once (and read back after that) before any slot is taken, so a copy that
  // fails costs no visitor or day slot and leaves no start window held.
  const url = await sampleUrl().catch((err: unknown) => {
    console.error("The sample video could not be prepared", err);
    return null;
  });
  if (!url) return { mode: "unavailable", status: 503, error: "The sample could not be prepared. Try again in a minute." };

  const limits = tryLimits();
  const replay = (limit: TryLimit): TryResult => {
    const reason = TRY_LIMIT_TEXT[limit](limit === "visitor" ? limits.perVisitor : limits.perDay);
    const done = newest(videos).find((v) => v.status === "done" && v.report);
    return done
      ? { mode: "replay", video: done, reason, limit }
      : { mode: "unavailable", status: 429, error: `${reason} ${limit === "budget" ? "Open" : "Try again tomorrow, or open"} the LaCroix campaign to see finished runs.` };
  };
  const day = now.toISOString().slice(0, 10);
  // Once the day is full, one read answers every later request: no slot writes to spam.
  if (await readDoc(`try/${day}/full.json`)) return replay("day");
  // The budget the demo password needs is never spent here: checked before any slot is taken.
  if (!openRunFits(budget().maxUsdPerRun, await ledgerSpentUsd())) return replay("budget");
  if (!(await takeSlot(`try/${day}/visitor-${await visitorKey(ip)}`, limits.perVisitor))) return replay("visitor");
  if (!(await takeSlot(`try/${day}/run`, limits.perDay))) {
    await createDoc(`try/${day}/full.json`, { at: now.toISOString() });
    return replay("day");
  }

  // One start per window: two visitors arriving together get one paid run, and the second joins it.
  if (!(await createDoc(`try/${day}/start-${Math.floor(now.getTime() / JOIN_MS)}.json`, { at: now.toISOString() }))) {
    // Someone else is starting it: wait a moment for their entry, then join it.
    for (let i = 0; i < 8; i++) {
      const starting = newest(await listVideos(TRY_ID)).find((v) => (v.status === "running" || v.status === "uploaded") && v.createdAt >= new Date(now.getTime() - JOIN_MS).toISOString());
      if (starting) return { mode: "joined", video: starting };
      await new Promise((r) => setTimeout(r, 400));
    }
    const done = newest(await listVideos(TRY_ID)).find((v) => v.status === "done" && v.report);
    return done ? { mode: "replay", video: done } : { mode: "unavailable", status: 429, error: "The sample is starting for someone else. Try again in a minute." };
  }
  const at = now.toISOString();
  // The pre-made report's chosen cover and opening frame, so the sample looks the same (the run keeps a set cover).
  const source = await getVideo(SOURCE.campaignId, SOURCE.videoId);
  const cover = source?.thumbUrl;
  const video = await putVideo({
    id: newVideoId("sample"),
    campaignId: TRY_ID,
    // Credited to the creator who filmed it, like the pre-made report.
    creator: "Ash",
    title: "Ash's Reel (sample)",
    videoUrl: url,
    sourceUrl: url,
    thumbUrl: cover,
    openAt: source?.openAt,
    status: "uploaded",
    step: null,
    createdAt: at,
    updatedAt: at,
  });
  return { mode: "started", video };
}
