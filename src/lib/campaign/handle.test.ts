// One handle comparison everywhere a roster name meets a video's creator. The LaCroix roster holds plain names
// ("Michael K") and a live upload adds "@" ("@Michael K"); these must be one creator. Route checks use a temp store.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VideoReport } from "@/lib/types";
import { creatorEntry } from "@/components/ed/campaign-ui";
import { handleKey, sameHandle } from "./handle";
import { feeFor, rollup } from "./money";
import { addCreators, creatorsWithoutVideo, removeCreator, setCreatorFee } from "./roster";
import { getCampaign, putCampaign } from "./store";
import type { Campaign, VideoEntry } from "./types";

describe("sameHandle", () => {
  it("matches a plain roster name to the @handle an upload adds, in any case", () => {
    expect(sameHandle("Michael K", "@Michael K")).toBe(true);
    expect(sameHandle("@maya", "MAYA")).toBe(true);
    expect(sameHandle("Ash", "@@ash")).toBe(true);
    expect(handleKey(" @Michael K ")).toBe("michael k");
  });

  it("keeps different creators apart", () => {
    expect(sameHandle("Michael", "Michael K")).toBe(false);
    expect(sameHandle("Aldo", "Aldo 2")).toBe(false);
    // Only a leading @ is dropped.
    expect(sameHandle("ma@ya", "maya")).toBe(false);
  });
});

const roster: Campaign = {
  id: "lacroix",
  name: "LaCroix: creators",
  brand: "LaCroix",
  prompt: "drink can",
  productDescription: "a pink can",
  brandTerms: ["LaCroix"],
  contractTerms: [],
  createdAt: "2026-11-03T00:00:00.000Z",
  fee: 300,
  creators: [
    { handle: "Ash", addedAt: "2026-11-03T00:00:00.000Z" },
    { handle: "Michael K", addedAt: "2026-11-03T00:00:00.000Z", fee: 250 },
  ],
};
const done = { terms: [] } as unknown as VideoReport;
const video = (id: string, creator: string, createdAt: string): VideoEntry => ({
  id,
  campaignId: "lacroix",
  creator,
  title: "x",
  videoUrl: "",
  status: "done",
  step: null,
  report: done,
  createdAt,
  updatedAt: createdAt,
});

describe("roster and money match a live @upload to a plain roster name", () => {
  const live = video("michael-k-live", "@Michael K", "2026-11-03T10:00:00.000Z");

  it("counts Michael K's live upload as his video, with his own fee", () => {
    expect(creatorsWithoutVideo(roster, [live])).toEqual(["Ash"]);
    expect(feeFor(roster, "@Michael K")).toBe(250);
    expect(feeFor(roster, "@ash")).toBe(300);
    const entry = creatorEntry(roster.creators![1], [live], "lacroix", Date.parse("2026-11-03T11:00:00.000Z"));
    expect(entry).toMatchObject({ handle: "Michael K", videos: 1, videoId: "michael-k-live" });
    // Negative control: Michael (no K) has no video here.
    expect(creatorEntry({ handle: "Michael" }, [live], "lacroix", Date.now())).toMatchObject({ status: "none", videos: 0 });
  });

  it("lets a re-cut uploaded as @ash replace Ash's first take", () => {
    const first = video("ash", "Ash", "2026-11-03T06:00:00.000Z");
    const recut = video("ash-recut", "@ash", "2026-11-03T07:00:00.000Z");
    const r = rollup({ creators: [{ handle: "Ash", addedAt: "2026-11-03T05:00:00.000Z" }] }, [first, recut]);
    expect(r.total).toBe(1);
    expect(r.deciding.map((v) => v.id)).toEqual(["ash-recut"]);
    expect(r.replacedBy.get("ash")?.id).toBe("ash-recut");
  });

  it("never adds a second Michael K, and edits or removes the plain-name entry by its @handle", () => {
    expect(addCreators(roster, ["@michael k", "@Jon"]).creators?.map((c) => c.handle)).toEqual(["Ash", "Michael K", "@Jon"]);
    expect(setCreatorFee(roster, "@Michael K", null).creators?.[1].fee).toBeUndefined();
    expect(removeCreator(roster, "@ASH").creators?.map((c) => c.handle)).toEqual(["Michael K"]);
  });
});

describe("creator fee route", () => {
  let dir = "";
  const savedEnv = { ...process.env };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "st-handle-"));
    process.env.SCREEN_TIME_STORE_DIR = dir;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
  afterAll(async () => {
    process.env = savedEnv;
    await rm(dir, { recursive: true, force: true });
  });

  it("finds a plain-name roster entry by the @handle the API sends", async () => {
    const creators = await import("@/app/api/campaigns/[id]/creators/route");
    await putCampaign(roster);
    const patch = (handle: string, fee: number | null) =>
      creators.PATCH(
        new Request("http://localhost/api", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, fee }) }),
        { params: Promise.resolve({ id: "lacroix" }) },
      );
    expect((await patch("Michael K", 275)).status).toBe(200);
    expect((await getCampaign("lacroix"))?.creators?.find((c) => c.handle === "Michael K")?.fee).toBe(275);
    expect((await patch("@nobody", 5)).status).toBe(404);
  });
});

describe("request links for plain-name roster entries", () => {
  it("signs the canonical @handle, so the link the submit route checks is valid", async () => {
    const { issueRequest } = await import("./roster");
    const { verifyRequestToken } = await import("./requests");
    const secret = "test-link-secret-at-least-32-characters";
    const issued = await issueRequest("lacroix", "Michael K", secret, new Date("2026-11-03T00:00:00Z"));
    expect(issued.creator).toBe("@Michael K");
    const token = issued.path.replace("/submit/", "");
    expect(await verifyRequestToken(token, secret, Date.parse("2026-11-04T00:00:00Z") / 1000)).toMatchObject({ creator: "@Michael K", campaignId: "lacroix" });
  });
});
