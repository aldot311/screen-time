import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  freeCampaignId,
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
  updateCampaign,
  updateVideo,
} from "./store";
import { ARCHIVED, isHidden } from "./visibility";
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
afterEach(() => {
  vi.unstubAllEnvs();
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
  it("round-trips campaigns and videos; an empty store lists nothing now the preview is archived", async () => {
    expect(await listCampaigns()).toEqual([]);
    // Scripts that read archived campaigns still get the labelled preview on an empty store.
    vi.stubEnv("SCREEN_TIME_SHOW_ARCHIVED", "1");
    expect((await listCampaigns()).map((c) => c.id)).toEqual(["preview"]);
    vi.unstubAllEnvs();
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

  it("keeps the preview campaign read-only, and hidden unless archived campaigns are shown", async () => {
    await expect(putCampaign({ ...campaign("preview") })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(putVideo(video("preview", "clip01"))).rejects.toBeInstanceOf(ReadOnlyError);
    expect(await getCampaign("preview")).toBeNull();
    expect(await getVideo("preview", "clip01")).toBeNull();
    expect(await listVideos("preview")).toEqual([]);
    vi.stubEnv("SCREEN_TIME_SHOW_ARCHIVED", "1");
    expect((await getCampaign("preview"))?.synthetic).toBe(true);
    expect((await getVideo("preview", "clip01"))?.status).toBe("done");
  });
});

describe("archived campaigns", () => {
  it("read as not found and are never listed, while their files stay in the store", async () => {
    await putCampaign(campaign("alani-nu-test-runs"));
    await putVideo(video("alani-nu-test-runs", "clip12"));
    await putCampaign(campaign("lacroix"));
    expect(await getCampaign("alani-nu-test-runs")).toBeNull();
    expect(await getVideo("alani-nu-test-runs", "clip12")).toBeNull();
    expect(await listVideos("alani-nu-test-runs")).toEqual([]);
    const listed = (await listCampaigns()).map((c) => c.id);
    expect(listed).toContain("lacroix");
    expect(listed).not.toContain("alani-nu-test-runs");
    // No API write reaches a hidden campaign either.
    expect(await updateCampaign("alani-nu-test-runs", (c) => ({ ...c, fee: 1 }))).toBeNull();
    expect(await updateVideo("alani-nu-test-runs", "clip12", (v) => ({ ...v, title: "changed" }))).toBeNull();
    // Negative control: an id that is not archived reads normally.
    expect((await getCampaign("lacroix"))?.id).toBe("lacroix");
  });

  it("are readable again with SCREEN_TIME_SHOW_ARCHIVED=1 (scripts only), and nothing else turns it on", async () => {
    vi.stubEnv("SCREEN_TIME_SHOW_ARCHIVED", "true");
    expect(await getCampaign("alani-nu-test-runs")).toBeNull();
    vi.stubEnv("SCREEN_TIME_SHOW_ARCHIVED", "1");
    expect((await getCampaign("alani-nu-test-runs"))?.id).toBe("alani-nu-test-runs");
    expect((await getVideo("alani-nu-test-runs", "clip12"))?.title).toBe("a.mp4");
    expect((await listVideos("alani-nu-test-runs")).map((v) => v.id)).toEqual(["clip12"]);
    expect((await listCampaigns()).map((c) => c.id)).toContain("alani-nu-test-runs");
  });

  it("covers every old campaign and the preview, never the LaCroix showcase", () => {
    for (const id of ["alani-nu-launch", "try-a-sample", "stanley-live-demo", "water-bottle-test-runs", "preview"]) expect(isHidden(id, {})).toBe(true);
    expect(isHidden("lacroix-strawberry-peach", {})).toBe(false);
    expect(ARCHIVED.size).toBe(12);
  });

  it("count as taken when a new campaign picks its id, so a new one never overwrites a hidden one", async () => {
    expect(await freeCampaignId("Stanley: test runs")).toMatch(/^stanley-test-runs-[a-z0-9]{6}$/);
    expect(await freeCampaignId("Stanley: live demo")).toMatch(/^stanley-live-demo-[a-z0-9]{6}$/);
    expect(await freeCampaignId("Preview")).toMatch(/^preview-[a-z0-9]{6}$/);
    // Taken even when this process may read archived campaigns.
    vi.stubEnv("SCREEN_TIME_SHOW_ARCHIVED", "1");
    expect(await freeCampaignId("Alani Nu: test runs")).toMatch(/^alani-nu-test-runs-[a-z0-9]{6}$/);
    vi.unstubAllEnvs();
    // Negative controls: a free name keeps its slug; a stored one gets a suffix.
    expect(await freeCampaignId("Summer creators")).toBe("summer-creators");
    expect(await freeCampaignId("Lacroix")).toMatch(/^lacroix-[a-z0-9]{6}$/);
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

describe("strongEtag", () => {
  it("drops the weak prefix a compressed CDN response adds, so ifMatch can match", async () => {
    const { strongEtag } = await import("./store");
    expect(strongEtag('W/"dc56"')).toBe('"dc56"');
    expect(strongEtag('"dc56"')).toBe('"dc56"');
  });
});
