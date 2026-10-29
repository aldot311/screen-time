import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getCampaign,
  getVideo,
  InvalidIdError,
  isFileKey,
  isValidId,
  listCampaigns,
  listVideos,
  localFileFromUrl,
  localPath,
  putCampaign,
  putVideo,
  ReadOnlyError,
  saveImageFile,
  saveVideoFile,
  slugify,
} from "./store";
import type { Campaign, VideoEntry } from "./types";

let dir = "";
const saved = { ...process.env };
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "st-store-"));
  process.env.SCREEN_TIME_STORE_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterAll(async () => {
  process.env = saved;
  await rm(dir, { recursive: true, force: true });
});

const campaign = (id: string): Campaign => ({
  id,
  name: "Fall creators",
  brand: "Alani Nu",
  prompt: "drink can",
  productDescription: "a teal can",
  brandTerms: ["Alani"],
  contractTerms: ["On screen at least 3 seconds in total"],
  createdAt: "2026-10-28T10:00:00.000Z",
});
const video = (campaignId: string, id: string): VideoEntry => ({
  id,
  campaignId,
  creator: "@a",
  title: "a.mp4",
  videoUrl: "/x",
  status: "uploaded",
  step: null,
  createdAt: "2026-10-28T10:00:00.000Z",
  updatedAt: "2026-10-28T10:00:00.000Z",
});

describe("local store", () => {
  it("round-trips campaigns and videos, and lists the preview only while the store is empty", async () => {
    expect((await listCampaigns()).map((c) => c.id)).toEqual(["preview"]);
    await putCampaign(campaign("fall"));
    expect(await getCampaign("fall")).toEqual(campaign("fall"));
    expect(await getCampaign("missing")).toBeNull();
    expect((await listCampaigns()).map((c) => c.id)).toEqual(["fall"]);

    const saved = await putVideo(video("fall", "v1"));
    expect(saved.updatedAt).not.toBe("2026-10-28T10:00:00.000Z");
    await putVideo({ ...video("fall", "v0"), createdAt: "2026-10-27T10:00:00.000Z" });
    expect(await getVideo("fall", "v1")).toEqual(saved);
    expect((await listVideos("fall")).map((v) => v.id)).toEqual(["v0", "v1"]);
    expect(await listVideos("nothing-here")).toEqual([]);
  });

  it("stores video files and maps their URLs back to the file", async () => {
    const url = await saveVideoFile("fall", "v1", new TextEncoder().encode("mp4 bytes"), "video/mp4");
    expect(url).toBe("/api/store/file?path=campaigns%2Ffall%2Ffiles%2Fv1%2Fsource.mp4");
    const path = localFileFromUrl(url, dir);
    expect(path).toBe(join(dir, "campaigns/fall/files/v1/source.mp4"));
    expect(await readFile(path!, "utf8")).toBe("mp4 bytes");
    await expect(saveVideoFile("fall", "v1", new Uint8Array(1), "text/html")).rejects.toThrow(/Unsupported/);
  });

  it("refuses ids and paths that could escape the store", async () => {
    for (const bad of ["../x", "a/b", "..", "", "A", "-a", "a-", "a".repeat(65), "a\0b"]) expect(isValidId(bad)).toBe(false);
    await expect(putCampaign(campaign("../../etc"))).rejects.toBeInstanceOf(InvalidIdError);
    await expect(putVideo(video("fall", "../v"))).rejects.toBeInstanceOf(InvalidIdError);
    await expect(saveVideoFile("fall", "v1", new Uint8Array(1), "video/mp4", "../x")).rejects.toBeInstanceOf(InvalidIdError);
    expect(await getCampaign("../../package")).toBeNull();
    expect(await getVideo("fall", "../../campaign")).toBeNull();
    expect(localPath(dir, "../outside.json")).toBeNull();
    expect(localPath(dir, "campaigns/../../outside.json")).toBeNull();
    expect(isFileKey("campaigns/fall/files/v1/../../../../etc/passwd")).toBe(false);
    expect(isFileKey("campaigns/fall/videos/v1.json")).toBe(false);
    expect(isFileKey("campaigns/fall/files/v1/thumb.jpg")).toBe(true);
    expect(isFileKey("campaigns/fall/files/v1/thumb.png")).toBe(true);
    expect(isFileKey("campaigns/fall/files/campaign/product-abc123.webp")).toBe(true);
    expect(isFileKey("campaigns/fall/files/campaign/product.svg")).toBe(false);
    expect(isFileKey("campaigns/fall/files/product-abc.png")).toBe(false);
    await expect(saveImageFile("fall", "campaign", "product", new Uint8Array(1), "image/svg+xml")).rejects.toThrow(/Unsupported/);
    await expect(saveImageFile("fall", "v1", "../thumb", new Uint8Array(1))).rejects.toBeInstanceOf(InvalidIdError);
    expect(localFileFromUrl("/api/store/file?path=..%2F..%2Fpackage.json", dir)).toBeNull();
    expect(localFileFromUrl("https://evil.example/x.mp4", dir)).toBeNull();
  });

  it("keeps the preview campaign read-only", async () => {
    await expect(putCampaign({ ...campaign("preview") })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(putVideo(video("preview", "clip01"))).rejects.toBeInstanceOf(ReadOnlyError);
    expect((await getCampaign("preview"))?.synthetic).toBe(true);
    expect((await getVideo("preview", "clip01"))?.status).toBe("done");
  });
});

describe("slugify", () => {
  it("makes url-safe ids", () => {
    expect(slugify("Alani Nu: Fall creators!")).toBe("alani-nu-fall-creators");
    expect(slugify("Ünïcode café")).toBe("unicode-cafe");
    expect(slugify("!!!")).toBe("item");
    expect(isValidId(slugify("x".repeat(100) + " y"))).toBe(true);
  });
});
