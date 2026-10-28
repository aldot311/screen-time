import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getVideo } from "./store";

// The run must never start in these tests: after() would kick off the real pipeline.
const afterSpy = vi.hoisted(() => vi.fn());
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: afterSpy,
  connection: async () => undefined, // there is no request scope outside Next
}));

const campaigns = await import("@/app/api/campaigns/route");
const campaignById = await import("@/app/api/campaigns/[id]/route");
const videos = await import("@/app/api/campaigns/[id]/videos/route");
const run = await import("@/app/api/campaigns/[id]/videos/[videoId]/run/route");
const exportCsv = await import("@/app/api/campaigns/[id]/export.csv/route");
const storeFile = await import("@/app/api/store/file/route");

let dir = "";
const savedEnv = { ...process.env };
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "st-routes-"));
  process.env.SCREEN_TIME_STORE_DIR = dir;
  delete process.env.BLOB_READ_WRITE_TOKEN;
});
afterAll(async () => {
  process.env = savedEnv;
  await rm(dir, { recursive: true, force: true });
});
beforeEach(() => {
  afterSpy.mockClear();
  delete process.env.META_MODEL_API_KEY;
});

const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const json = (body: unknown) =>
  new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function newCampaign(name = "Fall creators") {
  const res = await campaigns.POST(
    json({ name, brand: "Alani Nu", prompt: "drink can", productDescription: "a teal can", brandTerms: ["Alani"], contractTerms: [] }),
  );
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string };
}

async function upload(campaignId: string) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array([0, 0, 0, 1])], "My Clip.mp4", { type: "video/mp4" }));
  form.set("creator", "aldo");
  const res = await videos.POST(new Request("http://localhost/api", { method: "POST", body: form }), params({ id: campaignId }));
  return res;
}

describe("campaign routes", () => {
  it("creates campaigns with slug ids, never reusing one", async () => {
    expect((await newCampaign()).id).toBe("fall-creators");
    expect((await newCampaign()).id).toMatch(/^fall-creators-[a-z0-9]{6}$/);
    expect((await newCampaign("Preview")).id).toMatch(/^preview-[a-z0-9]{6}$/);
    const bad = await campaigns.POST(json({ name: "x" }));
    expect(bad.status).toBe(400);
    const list = (await (await campaigns.GET()).json()) as { id: string }[];
    expect(list.at(-1)?.id).toBe("preview");
    expect(list).toHaveLength(4);
  });

  it("returns a campaign with its videos, and 404 for an unknown one", async () => {
    const res = await campaignById.GET(new Request("http://localhost"), params({ id: "preview" }));
    const body = (await res.json()) as { campaign: { synthetic: boolean }; videos: unknown[] };
    expect(body.campaign.synthetic).toBe(true);
    expect(body.videos).toHaveLength(12);
    expect((await campaignById.GET(new Request("http://localhost"), params({ id: "../etc" }))).status).toBe(404);
  });

  it("uploads a video locally and serves it with ranges", async () => {
    const { id } = await newCampaign("Uploads");
    const res = await upload(id);
    expect(res.status).toBe(201);
    const v = (await res.json()) as { id: string; status: string; creator: string; videoUrl: string };
    expect(v).toMatchObject({ status: "uploaded", creator: "@aldo" });
    expect(v.id).toMatch(/^my-clip-[a-z0-9]{6}$/);

    vi.stubEnv("NODE_ENV", "development");
    try {
      const file = await storeFile.GET(new Request(`http://localhost${v.videoUrl}`, { headers: { range: "bytes=2-" } }));
      expect(file.status).toBe(206);
      expect(file.headers.get("Content-Range")).toBe("bytes 2-3/4");
      const escape = await storeFile.GET(new Request("http://localhost/api/store/file?path=..%2Fpackage.json"));
      expect(escape.status).toBe(400);
    } finally {
      vi.unstubAllEnvs();
    }
    // Not served outside development.
    expect((await storeFile.GET(new Request(`http://localhost${v.videoUrl}`))).status).toBe(404);
  });

  it("refuses uploads to the preview, wrong types and non-Blob URLs", async () => {
    expect((await upload("preview")).status).toBe(409);
    const { id } = await newCampaign("Types");
    const form = new FormData();
    form.set("file", new File(["<html>"], "x.html", { type: "text/html" }));
    form.set("creator", "@a");
    const res = await videos.POST(new Request("http://localhost/api", { method: "POST", body: form }), params({ id }));
    expect(res.status).toBe(415);
    const remote = await videos.POST(json({ url: "https://example.com/x.mp4", creator: "@a" }), params({ id }));
    expect(remote.status).toBe(400);
    const blob = await videos.POST(
      json({ url: "https://abc.public.blob.vercel-storage.com/campaigns/types/files/clip-x1.mp4", creator: "@a" }),
      params({ id }),
    );
    expect(blob.status).toBe(201);
    expect(await blob.json()).toMatchObject({ title: "clip-x1.mp4", status: "uploaded" });
  });
});

describe("POST run", () => {
  it("refuses the synthetic preview campaign", async () => {
    process.env.META_MODEL_API_KEY = "test-key";
    const res = await run.POST(new Request("http://localhost", { method: "POST" }), params({ id: "preview", videoId: "clip01" }));
    expect(res.status).toBe(409);
    expect(afterSpy).not.toHaveBeenCalled();
  });

  it("refuses with 503 when the Meta API key is not configured", async () => {
    const { id } = await newCampaign("No key");
    const v = (await (await upload(id)).json()) as { id: string };
    const res = await run.POST(new Request("http://localhost", { method: "POST" }), params({ id, videoId: v.id }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "The Meta API key is not configured" });
    expect((await getVideo(id, v.id))?.status).toBe("uploaded");
    expect(afterSpy).not.toHaveBeenCalled();
  });

  it("starts once, then refuses while it is running", async () => {
    process.env.META_MODEL_API_KEY = "test-key";
    const { id } = await newCampaign("Running");
    const v = (await (await upload(id)).json()) as { id: string; videoUrl: string };
    const post = () => run.POST(new Request("http://localhost", { method: "POST" }), params({ id, videoId: v.id }));

    const first = await post();
    expect(first.status).toBe(202);
    expect(await first.json()).toMatchObject({ status: "running", step: "normalize", sourceUrl: v.videoUrl });
    expect(afterSpy).toHaveBeenCalledTimes(1);

    const second = await post();
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "This video is already running" });
    expect(afterSpy).toHaveBeenCalledTimes(1);

    expect((await run.POST(new Request("http://localhost"), params({ id, videoId: "nope" }))).status).toBe(404);
  });
});

describe("GET export.csv", () => {
  it("downloads one row per video as an attachment", async () => {
    const res = await exportCsv.GET(new Request("http://localhost"), params({ id: "preview" }));
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="preview.csv"');
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect((await res.text()).trimEnd().split("\r\n")).toHaveLength(13);
  });
});
