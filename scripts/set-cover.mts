// Sets a video's cover (the still shown before it plays) from a JPEG, e.g. a frame chosen by hand, and optionally the
// second its report opens paused on (a frame the creator is happy to have shown).
// Usage: pnpm tsx --tsconfig tsconfig.json scripts/set-cover.mts <campaign id> <video id> <file.jpg> [open at, seconds]
import { readFile } from "node:fs/promises";
import { saveImageFile, updateVideo } from "@/lib/campaign/store";

const [campaignId, videoId, file, openAtArg] = process.argv.slice(2);
if (!campaignId || !videoId || !file) throw new Error("Pass the campaign id, video id and a JPEG");
const openAt = openAtArg === undefined ? undefined : Number(openAtArg);
if (openAt !== undefined && !(Number.isFinite(openAt) && openAt >= 0)) throw new Error(`Bad opening second: ${openAtArg}`);
// A new file name each time, so a cached copy of the old cover is never served under the new URL.
const url = await saveImageFile(campaignId, videoId, `cover-${Date.now()}`, new Uint8Array(await readFile(file)));
const after = await updateVideo(campaignId, videoId, (v) => ({ ...v, thumbUrl: url, ...(openAt !== undefined ? { openAt } : {}) }));
if (!after) throw new Error(`${campaignId}/${videoId} not found`);
console.log(videoId, "cover", url, openAt !== undefined ? `opens at ${openAt} s` : "");
