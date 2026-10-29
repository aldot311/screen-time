// Builds the showcase campaign: the 12 Alani Nu test clips re-run through today's full pipeline with a product photo
// and a fee, so receipts, feature checks, the photo comparison and money all show on real reports. The original
// "Alani Nu: test runs" campaign is left as it is: the accuracy page and the landing table are measured on it.
//
// Usage (writes to the store the env points at; needs META_MODEL_API_KEY):
//   ~/ai/bin/with-secrets.sh sh -c 'set -a; . ./.env.vercel; set +a; pnpm tsx --tsconfig tsconfig.json scripts/build-showcase.mts'
// The product photo is a frame from clip12 (Aldo's own footage of the can), named so in the campaign.
import { readFile } from "node:fs/promises";
import { executeRun, startRun } from "@/lib/campaign/runner";
import { getCampaign, getVideo, listVideos, putCampaign, putVideo, saveImageFile, saveVideoFile } from "@/lib/campaign/store";
import { isBlobUrl } from "@/lib/campaign/schema";
import { localFileFromUrl } from "@/lib/campaign/store";

const SOURCE = "alani-nu-test-runs";
const ID = "alani-nu-launch";
const PHOTO = "data/out/alani-can/clip12/clip12-obj0-2.jpg";

const src = await getCampaign(SOURCE);
if (!src) throw new Error(`No ${SOURCE} campaign in this store`);

let campaign = await getCampaign(ID);
if (!campaign) {
  campaign = await putCampaign({
    id: ID,
    name: "Alani Nu: launch, with product photo",
    brand: src.brand,
    prompt: src.prompt,
    productDescription: src.productDescription,
    brandTerms: src.brandTerms,
    contractTerms: src.contractTerms,
    fee: 300,
    createdAt: new Date().toISOString(),
  });
  console.log("created", ID);
}
if (!campaign.productImageUrl) {
  const url = await saveImageFile(ID, "campaign", "product-clip12-frame", new Uint8Array(await readFile(PHOTO)), "image/jpeg");
  campaign = await putCampaign({ ...campaign, productImageUrl: url });
  console.log("photo", url);
}

async function bytesOf(url: string, campaignId: string): Promise<Uint8Array> {
  const local = localFileFromUrl(url);
  if (local) return new Uint8Array(await readFile(local));
  if (!isBlobUrl(url, campaignId)) throw new Error(`Not in ${campaignId}'s store: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

const have = new Set((await listVideos(ID)).filter((v) => v.status === "done").map((v) => v.id));
for (const v of await listVideos(SOURCE)) {
  if (have.has(v.id)) {
    console.log(v.id, "already done");
    continue;
  }
  // The normalized copy of the original upload (the same frames the test run analyzed).
  const url = await saveVideoFile(ID, v.id, await bytesOf(v.videoUrl, SOURCE), "video/mp4", "source");
  const at = new Date().toISOString();
  await putVideo({ id: v.id, campaignId: ID, creator: v.creator, title: v.title, videoUrl: url, sourceUrl: url, status: "uploaded", step: null, createdAt: v.createdAt, updatedAt: at });
  const start = await startRun(ID, v.id);
  if (!start.ok) throw new Error(`${v.id}: ${start.error}`);
  const t0 = Date.now();
  const done = await executeRun(start.campaign, start.video);
  const after = await getVideo(ID, v.id);
  console.log(
    v.id,
    done.status,
    after?.report ? `${after.report.metrics.secondsOnScreen.toFixed(1)} s, photo ${after.report.usedProductPhoto}, $${after.report.cost.usd.toFixed(3)}` : done.error,
    `${Math.round((Date.now() - t0) / 1000)} s`,
  );
}
