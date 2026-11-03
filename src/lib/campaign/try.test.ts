// "Try a sample video" limits, against a temp local store. No model is called: startTry only creates the entry.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CAMPAIGN_FILES, getCampaign, listVideos, localFileFromUrl, putCampaign, putVideo, readDoc, saveImageFile, saveVideoFile } from "./store";
import { startTry, TRY_ID } from "./try";
import { isArchived } from "./visibility";

let dir = "";
const savedEnv = { ...process.env };
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "st-try-"));
  process.env.SCREEN_TIME_STORE_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.SCREEN_TIME_TRY_PER_VISITOR = "2";
  process.env.SCREEN_TIME_TRY_PER_DAY = "3";
});
afterAll(async () => {
  process.env = savedEnv;
  await rm(dir, { recursive: true, force: true });
});

const day = new Date("2026-10-29T12:00:00Z");
const later = (min: number) => new Date(day.getTime() + min * 60_000);

async function finishAll() {
  for (const v of await listVideos(TRY_ID)) if (v.status !== "done") await putVideo({ ...v, status: "done", report: { terms: [] } as never });
}

describe("startTry", () => {
  it("says the sample is unavailable before the source campaign exists", async () => {
    expect(await startTry("1.1.1.1", day)).toMatchObject({ mode: "unavailable", status: 503 });
  });

  it("creates nothing while the product photo cannot be copied, so the next visitor tries again", async () => {
    const brief = { name: "LaCroix", brand: "LaCroix", prompt: "drink can", productDescription: "a pink can", brandTerms: [], contractTerms: [], createdAt: day.toISOString() };
    await putCampaign({ id: "lacroix-strawberry-peach", ...brief, productImageUrl: "https://elsewhere.example/photo.jpg" });
    await expect(startTry("9.9.9.9", day)).rejects.toThrow(/not in this app's store/);
    expect(await getCampaign(TRY_ID)).toBeNull();
  });

  it("takes no slot when the sample video cannot be copied (Ash's re-cut is not in this store yet)", async () => {
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const photoUrl = await saveImageFile("lacroix-strawberry-peach", CAMPAIGN_FILES, "product-photo", photo);
    // The same brief as the next test, since the sample campaign is created from it once.
    await putCampaign({
      id: "lacroix-strawberry-peach",
      name: "LaCroix: Strawberry Peach creators",
      brand: "LaCroix",
      prompt: "drink can",
      productDescription: "a pink LaCroix Strawberry Peach can",
      brandTerms: ["LaCroix", "La Croix"],
      contractTerms: ["On screen at least 3 seconds in total", "Says LaCroix out loud"],
      fee: 300,
      productImageUrl: photoUrl,
      createdAt: day.toISOString(),
    });
    const early = new Date("2026-10-28T12:00:00Z");
    expect(await startTry("7.7.7.7", early)).toMatchObject({ mode: "unavailable", status: 503 });
    expect(await readDoc("try/2026-10-28/run-1.json")).toBeNull();
    expect(await readDoc(`try/2026-10-28/start-${Math.floor(early.getTime() / 120_000)}.json`)).toBeNull();
  });

  it("is a new sample, never the archived Alani one", () => {
    expect(TRY_ID).toBe("try-lacroix");
    expect(isArchived(TRY_ID)).toBe(false);
    expect(isArchived("try-a-sample")).toBe(true);
  });

  it("copies Ash's re-cut, the brief, fee and product photo into its own campaign, starts once, and lets a second visitor join", async () => {
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const photoUrl = await saveImageFile("lacroix-strawberry-peach", CAMPAIGN_FILES, "product-photo", photo);
    await putCampaign({
      id: "lacroix-strawberry-peach",
      name: "LaCroix: Strawberry Peach creators",
      brand: "LaCroix",
      prompt: "drink can",
      productDescription: "a pink LaCroix Strawberry Peach can",
      brandTerms: ["LaCroix", "La Croix"],
      contractTerms: ["On screen at least 3 seconds in total", "Says LaCroix out loud"],
      fee: 300,
      productImageUrl: photoUrl,
      creators: [{ handle: "Ash", addedAt: day.toISOString() }],
      createdAt: day.toISOString(),
    });
    const url = await saveVideoFile("lacroix-strawberry-peach", "ash-recut", new Uint8Array([0, 0, 0, 24]), "video/mp4", "normalized");
    await putVideo({ id: "ash-recut", campaignId: "lacroix-strawberry-peach", creator: "Ash", title: "Ash's Reel", videoUrl: url, thumbUrl: "/cover.jpg", openAt: 2.9, status: "done", step: null, createdAt: "", updatedAt: "" });

    const first = await startTry("1.1.1.1", day);
    expect(first.mode).toBe("started");
    if (first.mode !== "started") return;
    expect(first.video).toMatchObject({ campaignId: TRY_ID, creator: "Ash", title: "Ash's Reel (sample)", thumbUrl: "/cover.jpg", openAt: 2.9 });
    expect(first.video.sourceUrl).toContain(`campaigns%2F${TRY_ID}%2F`);
    expect(await readDoc("try/lacroix-sample.json")).toEqual({ url: first.video.sourceUrl });

    // The try campaign checks exactly what the pre-made report did: same brief and fee, and its own copy of the photo
    // (a run reads a photo only from its own campaign's folder). No roster: the sample is nobody's re-cut.
    const tryCampaign = await getCampaign(TRY_ID);
    expect(tryCampaign).toMatchObject({ brand: "LaCroix", prompt: "drink can", brandTerms: ["LaCroix", "La Croix"], fee: 300 });
    expect(tryCampaign?.creators).toBeUndefined();
    expect(tryCampaign?.productImageUrl).toContain(`campaigns%2F${TRY_ID}%2Ffiles%2Fcampaign%2F`);
    expect(new Uint8Array(await readFile(localFileFromUrl(tryCampaign!.productImageUrl!)!))).toEqual(photo);

    // Joining uses the entry's last update, which is the real clock: a run updated just now is live.
    const second = await startTry("2.2.2.2", new Date());
    expect(second).toMatchObject({ mode: "joined" });
    expect(second.mode !== "unavailable" && second.video.id).toBe(first.video.id);
  });

  it("caps runs per visitor and per day, then replays the newest finished run", async () => {
    await finishAll();
    expect((await startTry("1.1.1.1", later(10))).mode).toBe("started"); // visitor 1, run 2 of 3 today
    await finishAll();
    const capped = await startTry("1.1.1.1", later(20)); // visitor 1 used both of theirs
    expect(capped).toMatchObject({ mode: "replay", reason: "You have run the sample 2 times today.", limit: "visitor" });
    expect((await startTry("3.3.3.3", later(30))).mode).toBe("started"); // run 3 of 3
    await finishAll();
    expect(await startTry("4.4.4.4", later(40))).toMatchObject({ mode: "replay", reason: "Today's 3 sample runs are used up.", limit: "day" });
    // Later requests that day stop at the "full" marker, before any visitor slot is taken.
    expect(await startTry("5.5.5.5", later(50))).toMatchObject({ mode: "replay", reason: "Today's 3 sample runs are used up." });
    expect(await readDoc("try/2026-10-29/full.json")).not.toBeNull();
    // A new day starts fresh.
    expect((await startTry("4.4.4.4", new Date("2026-10-30T09:00:00Z"))).mode).toBe("started");
  });

  it("starts one paid run when two visitors arrive together; the other joins it", async () => {
    await finishAll();
    const at = new Date("2026-10-31T10:00:00Z");
    const [a, b] = await Promise.all([startTry("7.7.7.7", at), startTry("8.8.8.8", at)]);
    expect([a.mode, b.mode].sort()).toEqual(["joined", "started"]);
  });
});
