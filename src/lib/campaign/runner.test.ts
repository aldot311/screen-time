import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { byteLimit, executeRun, startRun, usdFromEnv } from "./runner";
import { getVideo, putCampaign, putVideo } from "./store";
import type { Campaign, VideoEntry } from "./types";

let dir = "";
const savedEnv = { ...process.env };
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "st-runner-"));
  process.env.SCREEN_TIME_STORE_DIR = dir;
  process.env.META_MODEL_API_KEY = "test-key"; // never used: these runs stop before any API call
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterAll(async () => {
  process.env = savedEnv;
  await rm(dir, { recursive: true, force: true });
});

const campaign: Campaign = {
  id: "c1", name: "C", brand: "B", prompt: "drink can", productDescription: "a can",
  brandTerms: [], contractTerms: [], createdAt: "2026-10-28T10:00:00.000Z",
};
const video = (over: Partial<VideoEntry> = {}): VideoEntry => ({
  id: "v1", campaignId: "c1", creator: "@a", title: "a.mp4", videoUrl: "https://example.com/a.mp4",
  status: "uploaded", step: null, createdAt: "2026-10-28T10:00:00.000Z", updatedAt: "2026-10-28T10:00:00.000Z", ...over,
});

describe("startRun", () => {
  it("lets a run that stopped updating long ago be restarted", async () => {
    await putCampaign(campaign);
    const saved = await putVideo(video({ status: "running" }));
    const soon = Date.parse(saved.updatedAt) + 60_000;
    expect(await startRun("c1", "v1", soon)).toMatchObject({ ok: false, status: 409 });
    const later = Date.parse(saved.updatedAt) + 10 * 60_000;
    expect(await startRun("c1", "v1", later)).toMatchObject({ ok: true, video: { status: "running" } });
  });
});

describe("executeRun", () => {
  it("records a failure instead of throwing, and never fetches a URL outside the store", async () => {
    await putCampaign(campaign);
    const v = await putVideo(video({ status: "running", step: "normalize" }));
    const done = await executeRun(campaign, v);
    expect(done).toMatchObject({ status: "failed", error: "The video's source is not in this campaign's store" });
    expect((await getVideo("c1", "v1"))?.status).toBe("failed");
  });
});

describe("usdFromEnv", () => {
  it("falls back to the default for unset or invalid caps", () => {
    expect(usdFromEnv("0.25", 0.5)).toBe(0.25);
    expect(usdFromEnv(undefined, 0.5)).toBe(0.5);
    expect(usdFromEnv("", 0.5)).toBe(0.5);
    expect(usdFromEnv("abc", 20)).toBe(20);
    expect(usdFromEnv("-1", 20)).toBe(20);
  });
});

describe("byteLimit", () => {
  it("passes data under the limit and fails once it is exceeded, whatever Content-Length said", async () => {
    const { Readable } = await import("node:stream");
    const { pipeline } = await import("node:stream/promises");
    const { Writable } = await import("node:stream");
    const sink = () => new Writable({ write: (_c, _e, cb) => cb() });
    await expect(pipeline(Readable.from([Buffer.alloc(5), Buffer.alloc(5)]), byteLimit(10), sink())).resolves.toBeUndefined();
    await expect(pipeline(Readable.from([Buffer.alloc(6), Buffer.alloc(6)]), byteLimit(10), sink())).rejects.toThrow("over 200 MB");
  });
});
