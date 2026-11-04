// The open sample route against a temp local store: only the site's own page may start it, and one address gets a
// few attempts per ten minutes before it reaches the store. No model is called: after() is a spy, fetch throws.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMPAIGN_FILES, listVideos, putCampaign, putVideo, saveImageFile, saveVideoFile } from "@/lib/campaign/store";
import { TRY_ID } from "@/lib/campaign/try";

const afterSpy = vi.hoisted(() => vi.fn());
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: afterSpy }));
const route = await import("./route");

let dir = "";
const savedEnv = { ...process.env };
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "st-try-route-"));
  process.env.SCREEN_TIME_STORE_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.META_MODEL_API_KEY = "test-key";
  process.env.SCREEN_TIME_TRY_PER_VISITOR = "100";
  process.env.SCREEN_TIME_TRY_PER_DAY = "100";
  vi.stubGlobal("fetch", async () => {
    throw new Error("no network in tests");
  });
  const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const photoUrl = await saveImageFile("lacroix-strawberry-peach", CAMPAIGN_FILES, "product-photo", photo);
  await putCampaign({
    id: "lacroix-strawberry-peach",
    name: "LaCroix: Strawberry Peach creators",
    brand: "LaCroix",
    prompt: "drink can",
    productDescription: "a pink LaCroix can",
    brandTerms: ["LaCroix"],
    contractTerms: ["Says LaCroix out loud"],
    fee: 300,
    productImageUrl: photoUrl,
    createdAt: "2026-11-01T00:00:00Z",
  });
  const url = await saveVideoFile("lacroix-strawberry-peach", "ash-recut", new Uint8Array([0, 0, 0, 24]), "video/mp4", "normalized");
  await putVideo({ id: "ash-recut", campaignId: "lacroix-strawberry-peach", creator: "Ash", title: "Ash's Reel", videoUrl: url, status: "done", step: null, createdAt: "", updatedAt: "" });
});
beforeEach(() => afterSpy.mockClear());
afterAll(async () => {
  vi.unstubAllGlobals();
  process.env = savedEnv;
  await rm(dir, { recursive: true, force: true });
});

const post = (headers: Record<string, string>) => route.POST(new Request("http://localhost/api/try", { method: "POST", headers }));

describe("POST /api/try", () => {
  it("refuses a POST that another site's page sends, before any slot or run", async () => {
    for (const site of ["cross-site", "same-site", "none"]) {
      const res = await post({ "sec-fetch-site": site, "x-real-ip": "198.51.100.1" });
      expect(res.status, site).toBe(403);
    }
    // A script with neither Sec-Fetch-Site nor Origin is refused too.
    expect((await post({ "x-real-ip": "198.51.100.2" })).status).toBe(403);
    expect(afterSpy).not.toHaveBeenCalled();
    expect(await listVideos(TRY_ID)).toHaveLength(0);
  });

  it("starts from the site's own page (Sec-Fetch-Site, or a matching Origin)", async () => {
    const res = await post({ "sec-fetch-site": "same-origin", "x-real-ip": "198.51.100.3" });
    expect(res.status).toBe(202);
    expect(afterSpy).toHaveBeenCalledTimes(1);
    const joined = await post({ origin: "http://localhost", host: "localhost", "x-real-ip": "198.51.100.4" });
    expect(joined.status).toBe(200);
    expect(await joined.json()).toMatchObject({ mode: "joined" });
  });

  it("stops one address after six attempts in ten minutes; another address still gets through", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await post({ "sec-fetch-site": "same-origin", "x-real-ip": "198.51.100.9" })).status);
    expect(statuses.slice(0, 6).every((s) => s === 200 || s === 202)).toBe(true);
    expect(statuses[6]).toBe(429);
    expect((await post({ "sec-fetch-site": "same-origin", "x-real-ip": "198.51.100.10" })).status).not.toBe(429);
  });
});
