// The landing page's picks and the campaign list order, against a temp local store. No model is called.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VideoReport } from "@/lib/types";
import { featuredFirst, loadShowcase, SHOWCASE_CAMPAIGN, showcaseFirst } from "./showcase";
import { putVideo } from "./store";
import { isArchived } from "./visibility";

let dir = "";
const savedEnv = { ...process.env };
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "st-showcase-"));
  process.env.SCREEN_TIME_STORE_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterAll(async () => {
  process.env = savedEnv;
  await rm(dir, { recursive: true, force: true });
});

const done = (id: string, status: "done" | "running" = "done") =>
  putVideo({
    id,
    campaignId: SHOWCASE_CAMPAIGN,
    creator: "Ash",
    title: "x",
    videoUrl: "/x",
    status,
    step: null,
    report: status === "done" ? ({ tracks: [], terms: [] } as unknown as VideoReport) : undefined,
    createdAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  });

describe("loadShowcase", () => {
  it("shows the LaCroix campaign, which is never archived", () => {
    expect(SHOWCASE_CAMPAIGN).toBe("lacroix-strawberry-peach");
    expect(isArchived(SHOWCASE_CAMPAIGN)).toBe(false);
  });

  it("leaves out whatever this store does not have finished", async () => {
    expect(await loadShowcase()).toEqual({ hero: null, lookalike: null, lookalikes: [] });
    await done("aldo");
    await done("aldo-2", "running");
    const partial = await loadShowcase();
    expect(partial.hero).toBeNull();
    // aldo-2 is not finished, so the Pamplemousse example leads.
    expect(partial.lookalikes.map((s) => s.video.id)).toEqual(["aldo"]);
    expect(partial.lookalike?.names).toEqual({ "1": "LaCroix Pamplemousse (a different flavor)" });
  });

  it("leads with Ash's re-cut and the Poppi can beside a counted LaCroix", async () => {
    await done("ash-recut");
    await done("aldo-2");
    const { hero, lookalike, lookalikes } = await loadShowcase();
    expect(hero).toMatchObject({ href: `/campaigns/${SHOWCASE_CAMPAIGN}/videos/ash-recut`, names: { "0": "LaCroix Strawberry Peach can" } });
    expect(lookalikes.map((s) => s.video.id)).toEqual(["aldo-2", "aldo"]);
    expect(lookalike?.names).toEqual({ "0": "Poppi Raspberry Rose (another brand)", "1": "LaCroix Strawberry Peach can" });
  });
});

describe("showcaseFirst", () => {
  const c = (id: string, brand: string, name = id) => ({ id, brand, name });
  const ids = (list: ReturnType<typeof c>[]) => [...list].sort(showcaseFirst(list, (x) => x.name)).map((x) => x.id);

  it("puts the showcase campaign first and keeps its brand together, then the other brands A-Z", () => {
    const list = [c("coffee", "Coffee cup"), c("lacroix-launch", "LaCroix", "a launch"), c(SHOWCASE_CAMPAIGN, "LaCroix", "z creators"), c("alani", "Alani Nu")];
    expect(ids(list)).toEqual([SHOWCASE_CAMPAIGN, "lacroix-launch", "alani", "coffee"]);
  });

  it("sorts by brand, then name, when the showcase campaign is not in the list", () => {
    expect(ids([c("b2", "B", "2"), c("a", "A"), c("b1", "B", "1")])).toEqual(["a", "b1", "b2"]);
  });
});

describe("featuredFirst", () => {
  const v = (id: string, creator: string, at: string) => ({ id, creator, createdAt: `2026-11-03T0${at}:00:00.000Z` });
  const videos = [v("george", "George", "1"), v("ash", "Ash", "2"), v("peter", "Peter", "3"), v("ash-recut", "Ash", "4")];

  it("puts Ash's videos first, re-cut before the take it replaced, on the showcase campaign", () => {
    expect(featuredFirst(SHOWCASE_CAMPAIGN, videos).map((x) => x.id)).toEqual(["ash-recut", "ash", "george", "peter"]);
  });

  it("leaves any other campaign, or a store without the hero video, in its own order", () => {
    expect(featuredFirst("other-campaign", videos).map((x) => x.id)).toEqual(["george", "ash", "peter", "ash-recut"]);
    expect(featuredFirst(SHOWCASE_CAMPAIGN, videos.filter((x) => x.id !== "ash-recut")).map((x) => x.id)).toEqual(["george", "ash", "peter"]);
  });
});
