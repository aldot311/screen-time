// "Try a sample video" limits, against a temp local store. No model is called: startTry only creates the entry.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listVideos, putCampaign, putVideo, readDoc, saveVideoFile } from "./store";
import { startTry, TRY_ID } from "./try";

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

  it("copies the sample into its own campaign, starts once, and lets a second visitor join the live run", async () => {
    await putCampaign({
      id: "alani-nu-test-runs",
      name: "Alani Nu: test runs",
      brand: "Alani Nu",
      prompt: "drink can",
      productDescription: "a teal can",
      brandTerms: ["Alani"],
      contractTerms: ["Say the brand name at least once"],
      createdAt: day.toISOString(),
    });
    const url = await saveVideoFile("alani-nu-test-runs", "clip12", new Uint8Array([0, 0, 0, 24]), "video/mp4", "normalized");
    await putVideo({ id: "clip12", campaignId: "alani-nu-test-runs", creator: "@a", title: "clip12.mp4", videoUrl: url, status: "done", step: null, createdAt: "", updatedAt: "" });

    const first = await startTry("1.1.1.1", day);
    expect(first.mode).toBe("started");
    if (first.mode !== "started") return;
    expect(first.video.campaignId).toBe(TRY_ID);
    expect(first.video.sourceUrl).toContain(`campaigns%2F${TRY_ID}%2F`);

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
});
