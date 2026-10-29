// "Try a sample video": anyone can run the real pipeline on one fixed sample Reel, without the demo password. It
// spends real Meta credits, so it is fenced three ways: a visitor (hashed IP) gets a few runs a day, everyone together
// gets a daily cap, and while a sample run is in progress new visitors join it instead of starting another. The
// per-video and total budget caps of every run still apply. Past a limit, the newest finished run is shown instead.
import { readFile } from "node:fs/promises";
import { linkSecret } from "./requests";
import { newVideoId } from "./add-video";
import { isBlobUrl, MAX_VIDEO_BYTES } from "./schema";
import { createDoc, getCampaign, getVideo, listVideos, localFileFromUrl, putCampaign, putVideo, readDoc, saveVideoFile, takeSlot } from "./store";
import { usdFromEnv } from "./runner";
import type { Campaign, VideoEntry } from "./types";

export const TRY_ID = "try-a-sample";
/** The sample: a 12-second Reel with the Alani Nu can and a Stanley tumbler beside it (a look-alike to reject). */
const SOURCE = { campaignId: "alani-nu-test-runs", videoId: "clip12" };
/** A running sample untouched this long is treated as dead, and a new one may start. */
const JOIN_MS = 2 * 60 * 1000;

export const tryLimits = (env: Record<string, string | undefined> = process.env) => ({
  perVisitor: Math.floor(usdFromEnv(env.SCREEN_TIME_TRY_PER_VISITOR, 3)),
  perDay: Math.floor(usdFromEnv(env.SCREEN_TIME_TRY_PER_DAY, 25)),
});

/** Which limit sent a visitor to a replay. Links carry this code, never free text. */
export type TryLimit = "visitor" | "day";

export const TRY_LIMIT_TEXT: Record<TryLimit, (n: number) => string> = {
  visitor: (n) => `You have run the sample ${n} times today.`,
  day: (n) => `Today's ${n} sample runs are used up.`,
};

export type TryResult =
  | { mode: "started" | "joined" | "replay"; video: VideoEntry; reason?: string; limit?: TryLimit }
  | { mode: "unavailable"; status: number; error: string };

async function visitorKey(ip: string): Promise<string> {
  const salt = linkSecret() ?? "screen-time-try";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`try-v1:${salt}:${ip}`));
  return Buffer.from(digest).toString("hex").slice(0, 24);
}

async function ensureCampaign(): Promise<Campaign | null> {
  const existing = await getCampaign(TRY_ID);
  if (existing) return existing;
  const src = await getCampaign(SOURCE.campaignId);
  if (!src) return null;
  return putCampaign({
    id: TRY_ID,
    name: `${src.brand}: try it on a sample Reel`,
    brand: src.brand,
    prompt: src.prompt,
    productDescription: src.productDescription,
    brandTerms: src.brandTerms,
    contractTerms: src.contractTerms,
    createdAt: new Date().toISOString(),
  });
}

/** The sample's file inside the try campaign's own folder (runs only read files from their campaign), copied once. */
async function sampleUrl(): Promise<string> {
  const known = await readDoc<{ url: string }>("try/sample.json");
  if (known?.url) return known.url;
  const src = await getVideo(SOURCE.campaignId, SOURCE.videoId);
  if (!src) throw new Error("The sample video is missing");
  const from = src.videoUrl;
  let bytes: Uint8Array;
  const local = localFileFromUrl(from);
  if (local) bytes = new Uint8Array(await readFile(local));
  else if (isBlobUrl(from, SOURCE.campaignId)) {
    const res = await fetch(from, { redirect: "error" });
    if (!res.ok) throw new Error(`Could not read the sample video (${res.status})`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } else throw new Error("The sample video is not in this app's store");
  if (bytes.length > MAX_VIDEO_BYTES) throw new Error("The sample video is too large");
  const url = await saveVideoFile(TRY_ID, "sample", bytes, "video/mp4", "source");
  // Two first visitors may both copy it; the first record wins and both copies are the same file.
  if (await createDoc("try/sample.json", { url })) return url;
  return (await readDoc<{ url: string }>("try/sample.json"))?.url ?? url;
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

  const limits = tryLimits();
  const replay = (limit: TryLimit): TryResult => {
    const reason = TRY_LIMIT_TEXT[limit](limit === "visitor" ? limits.perVisitor : limits.perDay);
    const done = newest(videos).find((v) => v.status === "done" && v.report);
    return done
      ? { mode: "replay", video: done, reason, limit }
      : { mode: "unavailable", status: 429, error: `${reason} Try again tomorrow, or open the Alani Nu campaign to see finished runs.` };
  };
  const day = now.toISOString().slice(0, 10);
  // Once the day is full, one read answers every later request: no slot writes to spam.
  if (await readDoc(`try/${day}/full.json`)) return replay("day");
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
  const url = await sampleUrl();
  const at = now.toISOString();
  const video = await putVideo({
    id: newVideoId("sample"),
    campaignId: TRY_ID,
    creator: "@sample.reel",
    title: "Sample Reel",
    videoUrl: url,
    sourceUrl: url,
    status: "uploaded",
    step: null,
    createdAt: at,
    updatedAt: at,
  });
  return { mode: "started", video };
}
