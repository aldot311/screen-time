// The owner's reserve: the open sample stops starting once the ledger is within SCREEN_TIME_OWNER_RESERVE_USD of the
// total cap, before any slot is taken, so public traffic never spends what the demo password needs.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CAMPAIGN_FILES, listVideos, putCampaign, putVideo, readDoc, saveImageFile, saveVideoFile } from "./store";
import { startTry, TRY_ID } from "./try";

let dir = "";
const savedEnv = { ...process.env };
const ledgerAt = (usd: number) => writeFile(join(dir, "ledger.json"), JSON.stringify([{ at: "2026-11-03T00:00:00Z", usd, note: "earlier runs" }]));
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "st-try-budget-"));
  process.env.SCREEN_TIME_STORE_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.SCREEN_TIME_MAX_USD_TOTAL = "20";
  process.env.SCREEN_TIME_MAX_USD_PER_VIDEO = "0.5";
  process.env.SCREEN_TIME_OWNER_RESERVE_USD = "5";
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

describe("startTry and the owner's reserve", () => {
  const at = new Date("2026-11-04T12:00:00Z");
  it("stops before any slot once a run would reach into the reserve", async () => {
    await ledgerAt(14.6); // 14.6 + a run's 0.5 > 20 - 5
    const res = await startTry("1.1.1.1", at);
    expect(res).toMatchObject({ mode: "unavailable", status: 429 });
    expect(res.mode === "unavailable" && res.error).toBe("The free sample runs for this demo are used up. Open the LaCroix campaign to see finished runs.");
    expect(await readDoc("try/2026-11-04/run-1.json")).toBeNull();
  });
  it("starts while a whole run still fits above the reserve", async () => {
    await ledgerAt(14.5); // 14.5 + 0.5 = 15
    expect((await startTry("1.1.1.1", at)).mode).toBe("started");
    expect(await readDoc("try/2026-11-04/run-1.json")).not.toBeNull(); // the slot the other cases never take
  });
  it("past the reserve, replays the newest finished sample with the fixed text, still taking no slot", async () => {
    for (const v of await listVideos(TRY_ID)) await putVideo({ ...v, status: "done", report: { terms: [] } as never });
    await ledgerAt(14.6);
    const res = await startTry("2.2.2.2", new Date(at.getTime() + 10 * 60_000));
    expect(res).toMatchObject({ mode: "replay", limit: "budget", reason: "The free sample runs for this demo are used up." });
    expect(await readDoc("try/2026-11-04/run-2.json")).toBeNull();
  });
});
