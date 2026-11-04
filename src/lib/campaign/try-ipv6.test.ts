// The sample's per-visitor limit counts an IPv6 visitor by their /64, as the open agent's does (client-ip.ts clientKey):
// one holder usually controls the whole /64 and can rotate addresses inside it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CAMPAIGN_FILES, listVideos, putCampaign, putVideo, saveImageFile, saveVideoFile } from "./store";
import { startTry, TRY_ID } from "./try";

let dir = "";
const savedEnv = { ...process.env };
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "st-try-v6-"));
  process.env.SCREEN_TIME_STORE_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.SCREEN_TIME_TRY_PER_VISITOR = "1";
  process.env.SCREEN_TIME_TRY_PER_DAY = "10";
  const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const photoUrl = await saveImageFile("lacroix-strawberry-peach", CAMPAIGN_FILES, "product-photo", photo);
  await putCampaign({ id: "lacroix-strawberry-peach", name: "LaCroix", brand: "LaCroix", prompt: "drink can", productDescription: "a pink can", brandTerms: [], contractTerms: [], productImageUrl: photoUrl, createdAt: "2026-11-01T00:00:00Z" });
  const url = await saveVideoFile("lacroix-strawberry-peach", "ash-recut", new Uint8Array([0, 0, 0, 24]), "video/mp4", "normalized");
  await putVideo({ id: "ash-recut", campaignId: "lacroix-strawberry-peach", creator: "Ash", title: "Ash's Reel", videoUrl: url, status: "done", step: null, createdAt: "", updatedAt: "" });
});
afterAll(async () => {
  process.env = savedEnv;
  await rm(dir, { recursive: true, force: true });
});

const finishAll = async () => {
  for (const v of await listVideos(TRY_ID)) if (v.status !== "done") await putVideo({ ...v, status: "done", report: { terms: [] } as never });
};

describe("startTry per-visitor limit", () => {
  it("counts two addresses in one IPv6 /64 as one visitor", async () => {
    const t0 = new Date("2026-11-04T12:00:00Z");
    expect((await startTry("2001:db8:1:2::a", t0)).mode).toBe("started");
    await finishAll();
    const second = await startTry("2001:db8:1:2:ffff::b", new Date(t0.getTime() + 10 * 60_000));
    expect(second).toMatchObject({ mode: "replay", limit: "visitor" });
    // A different /64 is a different visitor.
    expect((await startTry("2001:db8:1:3::a", new Date(t0.getTime() + 20 * 60_000))).mode).toBe("started");
  });
});
