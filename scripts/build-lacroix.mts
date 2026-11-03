// Builds the LaCroix campaign from friends' captioned Reels: one product photo, three plain-English terms, a fee, and
// each video run through the full pipeline. The Reels are not in this repo (they are people's faces); pass the
// folder that holds them.
//
// Usage (writes to the store the env points at; needs META_MODEL_API_KEY):
//   ~/ai/bin/with-secrets.sh sh -c 'set -a; . ./.env.vercel; set +a; pnpm tsx --tsconfig tsconfig.json scripts/build-lacroix.mts ~/Movies/screen-time-work'
// The folder must hold photo/product-photo.jpg and out/<file>-captioned.mp4 for each entry in VIDEOS.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { executeRun, startRun } from "@/lib/campaign/runner";
import { getCampaign, getVideo, listVideos, putCampaign, putVideo, saveImageFile, saveVideoFile } from "@/lib/campaign/store";

const DIR = process.argv[2];
if (!DIR) throw new Error("Pass the folder that holds photo/ and out/");
const ID = "lacroix-strawberry-peach";

// In upload order: a re-cut (Ash's second take) must come after the first one.
const VIDEOS = [
  { id: "george", creator: "George", file: "1-George" },
  { id: "michael", creator: "Michael", file: "1-Michael" },
  { id: "jamal", creator: "Jamal", file: "2-Jamal" },
  { id: "lana", creator: "Lana", file: "4-Lana" },
  { id: "ash", creator: "Ash", file: "7a-Ash" },
  { id: "peter", creator: "Peter", file: "8-Peter" },
  { id: "aldo", creator: "Aldo", file: "10-Aldo" },
  { id: "jon", creator: "Jon", file: "11-Jon" },
  { id: "ash-recut", creator: "Ash", file: "7b-Ash" },
];

let campaign = await getCampaign(ID);
if (!campaign) {
  const now = new Date().toISOString();
  campaign = await putCampaign({
    id: ID,
    name: "LaCroix: Strawberry Peach creators",
    brand: "LaCroix",
    prompt: "drink can",
    productDescription:
      "a pink LaCroix Strawberry Peach sparkling water can: blue 'LaCroix' script over a yellow peach, red and yellow hearts, strawberries and green stripes near the base",
    brandTerms: ["LaCroix", "La Croix"],
    contractTerms: [
      "On screen at least 3 seconds in total",
      "Says LaCroix out loud",
      "Discloses the ad: says it is an ad or sponsored",
    ],
    fee: 300,
    creators: [...new Set(VIDEOS.map((v) => v.creator))].map((handle) => ({ handle, addedAt: now })),
    createdAt: now,
  });
  console.log("created", ID);
}
if (!campaign.productImageUrl) {
  const url = await saveImageFile(ID, "campaign", "product-photo", new Uint8Array(await readFile(join(DIR, "photo/product-photo.jpg"))), "image/jpeg");
  campaign = await putCampaign({ ...campaign, productImageUrl: url });
  console.log("photo", url);
}

const done = new Set((await listVideos(ID)).filter((v) => v.status === "done").map((v) => v.id));
let usd = 0;
for (const [i, v] of VIDEOS.entries()) {
  if (done.has(v.id)) {
    console.log(v.id, "already done");
    continue;
  }
  const url = await saveVideoFile(ID, v.id, new Uint8Array(await readFile(join(DIR, `out/${v.file}-captioned.mp4`))), "video/mp4", "source");
  // Spaced a minute apart so the order (and which take is the re-cut) is stable.
  const at = new Date(Date.now() - (VIDEOS.length - i) * 60_000).toISOString();
  await putVideo({ id: v.id, campaignId: ID, creator: v.creator, title: `${v.creator}'s Reel`, videoUrl: url, sourceUrl: url, status: "uploaded", step: null, createdAt: at, updatedAt: at });
  const start = await startRun(ID, v.id);
  if (!start.ok) throw new Error(`${v.id}: ${start.error}`);
  const t0 = Date.now();
  const result = await executeRun(start.campaign, start.video);
  const after = await getVideo(ID, v.id);
  const r = after?.report;
  if (r) usd += r.cost.usd;
  console.log(
    v.id,
    result.status,
    r
      ? `${r.metrics.secondsOnScreen.toFixed(1)} s on screen; ${r.terms.map((t) => `${t.pass === null ? "?" : t.pass ? "PASS" : "FAIL"} ${t.term.text} (${t.detail})`).join("; ")}; $${r.cost.usd.toFixed(3)}`
      : result.error,
    `${Math.round((Date.now() - t0) / 1000)} s`,
  );
}
console.log(`total $${usd.toFixed(2)}`);
