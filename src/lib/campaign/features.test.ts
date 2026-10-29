// Product photo, creator roster and bulk request routes, against a temp local store. No network.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FILE_TYPES, getCampaign, localBackend, localFileFromUrl, putVideo, updateCampaign } from "./store";
import { verifyRequestToken } from "./requests";
import { productPhoto } from "./runner";
import { sniffImageType } from "./schema";
import type { Campaign } from "./types";

const campaigns = await import("@/app/api/campaigns/route");
const photo = await import("@/app/api/campaigns/[id]/photo/route");
const creators = await import("@/app/api/campaigns/[id]/creators/route");
const requests = await import("@/app/api/campaigns/[id]/requests/route");
const bulk = await import("@/app/api/campaigns/[id]/requests/bulk/route");

const SECRET = "a-long-enough-secret-for-request-links";
let dir = "";
const savedEnv = { ...process.env };
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "st-features-"));
  process.env.SCREEN_TIME_STORE_DIR = dir;
  process.env.SCREEN_TIME_LINK_SECRET = SECRET;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_HOST;
});
afterAll(async () => {
  process.env = savedEnv;
  await rm(dir, { recursive: true, force: true });
});

const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
const json = (body: unknown, method = "POST") =>
  new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function newCampaign(name: string): Promise<string> {
  const res = await campaigns.POST(
    json({ name, brand: "Alani Nu", prompt: "drink can", productDescription: "a teal can", brandTerms: [], contractTerms: [] }),
  );
  return ((await res.json()) as { id: string }).id;
}

// Real magic bytes, padded.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

function photoForm(bytes: Uint8Array<ArrayBuffer>, type: string, name = "can.png") {
  const form = new FormData();
  form.set("file", new File([bytes], name, { type }));
  return new Request("http://localhost/api", { method: "POST", body: form });
}

describe("sniffImageType", () => {
  it("knows JPEG, PNG and WebP by their bytes and nothing else", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("POST /api/campaigns/[id]/photo", () => {
  it("stores a PNG under the campaign's files, sets productImageUrl and returns the campaign", async () => {
    const id = await newCampaign("Photo ok");
    const res = await photo.POST(photoForm(PNG, "image/png"), params({ id }));
    expect(res.status).toBe(200);
    const c = (await res.json()) as Campaign;
    expect(c.id).toBe(id);
    expect(c.productImageUrl).toMatch(new RegExp(`^/api/store/file\\?path=campaigns%2F${id}%2Ffiles%2Fcampaign%2Fproduct-[a-z0-9]{6}\\.png$`));
    expect((await getCampaign(id))?.productImageUrl).toBe(c.productImageUrl);
    const path = localFileFromUrl(c.productImageUrl!);
    expect(path && new Uint8Array(await readFile(path))).toEqual(PNG);
    // The runner hands Muse Spark the stored photo as a data URL.
    expect(await productPhoto(c)).toBe(`data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
  });

  it("accepts JPEG and WebP, typed by their bytes", async () => {
    const id = await newCampaign("Photo types");
    for (const [bytes, type, ext] of [[JPEG, "image/jpeg", "jpg"], [WEBP, "image/webp", "webp"]] as const) {
      const c = (await (await photo.POST(photoForm(bytes, type), params({ id }))).json()) as Campaign;
      expect(c.productImageUrl).toMatch(new RegExp(`\\.${ext}$`));
    }
  });

  it("refuses other types, files whose bytes are not an image, empty and oversize files", async () => {
    const id = await newCampaign("Photo refusals");
    expect((await photo.POST(photoForm(PNG, "image/gif", "a.gif"), params({ id }))).status).toBe(415);
    expect((await photo.POST(photoForm(new TextEncoder().encode("<svg/>"), "image/svg+xml"), params({ id }))).status).toBe(415);
    // Declared PNG, but HTML inside.
    expect((await photo.POST(photoForm(new TextEncoder().encode("<html>"), "image/png"), params({ id }))).status).toBe(415);
    expect((await photo.POST(photoForm(new Uint8Array(), "image/png"), params({ id }))).status).toBe(400);
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await photo.POST(photoForm(big, "image/png"), params({ id }))).status).toBe(413);
    expect((await photo.POST(new Request("http://localhost/api", { method: "POST", body: new FormData() }), params({ id }))).status).toBe(400);
    expect((await getCampaign(id))?.productImageUrl).toBeUndefined();
  });

  it("keeps the preview read-only and 404s an unknown campaign", async () => {
    expect((await photo.POST(photoForm(PNG, "image/png"), params({ id: "preview" }))).status).toBe(409);
    expect((await photo.POST(photoForm(PNG, "image/png"), params({ id: "no-such-campaign" }))).status).toBe(404);
  });

  it("registers a Blob URL only in this campaign's folder, as a product photo that exists", async () => {
    const id = await newCampaign("Photo json");
    vi.stubEnv("BLOB_STORE_HOST", "store.public.blob.vercel-storage.com");
    try {
      const host = "https://store.public.blob.vercel-storage.com";
      const register = (url: string) => photo.POST(json({ url }), params({ id }));
      expect((await register("https://evil.example/product-a.png")).status).toBe(400);
      expect((await register(`${host}/campaigns/other/files/product-a.png`)).status).toBe(400);
      expect((await register(`${host}/campaigns/${id}/campaign.json`)).status).toBe(400);
      expect((await register(`${host}/campaigns/${id}/files/clip-abc.mp4`)).status).toBe(400);
      expect((await register(`${host}/campaigns/${id}/files/req-abc123def456-x.png`)).status).toBe(400);
      expect((await register("not a url")).status).toBe(400);
      // Right folder and name, but no such file in the store (the local store cannot hold a Blob URL).
      expect((await register(`${host}/campaigns/${id}/files/product-can-x1y2.png`)).status).toBe(400);
      expect((await getCampaign(id))?.productImageUrl).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("creator roster", () => {
  it("adds handles deduplicated case-insensitively, and removes one", async () => {
    const id = await newCampaign("Roster");
    const add = (handles: unknown) => creators.POST(json({ handles }), params({ id }));
    const first = (await (await add(["maya", "@Leo", "@MAYA"])).json()) as Campaign;
    expect(first.creators?.map((c) => c.handle)).toEqual(["@maya", "@Leo"]);
    expect(first.creators?.[0].addedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    const second = (await (await add(["@leo", "sam"])).json()) as Campaign;
    expect(second.creators?.map((c) => c.handle)).toEqual(["@maya", "@Leo", "@sam"]);

    expect((await add([])).status).toBe(400);
    expect((await add(Array.from({ length: 51 }, (_, i) => `c${i}`))).status).toBe(400);
    expect((await add(["x".repeat(65)])).status).toBe(400);
    expect((await creators.POST(json({ handles: ["a"] }), params({ id: "preview" }))).status).toBe(409);

    const removed = (await (await creators.DELETE(json({ handle: "LEO" }, "DELETE"), params({ id }))).json()) as Campaign;
    expect(removed.creators?.map((c) => c.handle)).toEqual(["@maya", "@sam"]);
    expect((await creators.DELETE(json({ handle: "nobody" }, "DELETE"), params({ id }))).status).toBe(200);
    expect((await creators.DELETE(json({}, "DELETE"), params({ id }))).status).toBe(400);
  });
});

describe("updateCampaign", () => {
  it("keeps every one of 10 simultaneous roster adds", async () => {
    const id = await newCampaign("Concurrent adds");
    const handles = Array.from({ length: 10 }, (_, i) => `creator${i}`);
    const codes = await Promise.all(handles.map((h) => creators.POST(json({ handles: [h] }), params({ id })).then((r) => r.status)));
    expect(codes).toEqual(Array(10).fill(200));
    expect((await getCampaign(id))!.creators!.map((c) => c.handle).sort()).toEqual(handles.map((h) => `@${h}`).sort());
  });

  it("keeps a photo, roster edits and request records made at the same time", async () => {
    const id = await newCampaign("Concurrent mixed");
    await Promise.all([
      photo.POST(photoForm(PNG, "image/png"), params({ id })),
      creators.POST(json({ handles: ["a", "b"] }), params({ id })),
      requests.POST(json({ creator: "c" }), params({ id })),
      bulk.POST(json({ creators: ["d"] }), params({ id })),
    ]);
    const c = (await getCampaign(id))!;
    expect(c.productImageUrl).toBeDefined();
    expect(c.creators!.map((x) => x.handle).sort()).toEqual(["@a", "@b", "@c", "@d"]);
  });

  it("refuses the preview, returns null for a missing campaign, and never changes the id", async () => {
    await expect(updateCampaign("preview", (c) => c)).rejects.toThrow(/read-only/);
    expect(await updateCampaign("no-such-campaign", (c) => c)).toBeNull();
    const id = await newCampaign("Id fixed");
    await expect(updateCampaign(id, (c) => ({ ...c, id: "other" }))).rejects.toThrow(/id/);
    expect((await getCampaign(id))!.id).toBe(id);
  });
});

describe("stored image types", () => {
  it("maps .jpg and .jpeg to image/jpeg for serving and storedFileInfo", async () => {
    expect(FILE_TYPES.jpg).toBe("image/jpeg");
    expect(FILE_TYPES.jpeg).toBe("image/jpeg");
    const store = localBackend(dir);
    const url = await store.putFile("campaigns/types/files/campaign/product-abc.jpeg", JPEG, "image/jpeg");
    expect(await store.fileInfo(url)).toEqual({ size: JPEG.length, contentType: "image/jpeg" });
  });
});

describe("request links on the roster", () => {
  it("records a single request on the creator (adding them) without storing the link", async () => {
    const id = await newCampaign("Single request");
    const res = await requests.POST(json({ creator: "Maya" }), params({ id }));
    expect(res.status).toBe(201);
    const link = (await res.json()) as { path: string; creator: string; expiresAt: string };
    expect(link.creator).toBe("@Maya");
    const token = link.path.replace("/submit/", "");
    const claims = await verifyRequestToken(token, SECRET);

    const c = (await getCampaign(id))!;
    expect(c.creators).toEqual([
      { handle: "@Maya", addedAt: expect.any(String), request: { nonce: claims!.nonce, sentAt: expect.any(String), expiresAt: link.expiresAt } },
    ]);
    const stored = await readFile(join(dir, "campaigns", id, "campaign.json"), "utf8");
    expect(stored).not.toContain(token);
    expect(stored).not.toContain("/submit/");

    // A second link for the same creator (any case) replaces the record, not the entry.
    await requests.POST(json({ creator: "@maya" }), params({ id }));
    const again = (await getCampaign(id))!;
    expect(again.creators).toHaveLength(1);
    expect(again.creators![0].request!.nonce).not.toBe(claims!.nonce);
  });

  it("bulk: links for every roster creator without a video, recorded, never stored", async () => {
    const id = await newCampaign("Bulk");
    await creators.POST(json({ handles: ["maya", "leo", "sam"] }), params({ id }));
    // @leo already sent a video.
    await putVideo({
      id: "leo-clip-abc123", campaignId: id, creator: "@LEO", title: "x.mp4", videoUrl: "/x", status: "uploaded",
      step: null, createdAt: "2026-10-29T00:00:00.000Z", updatedAt: "2026-10-29T00:00:00.000Z",
    });
    const res = await bulk.POST(new Request("http://localhost/api", { method: "POST" }), params({ id }));
    expect(res.status).toBe(201);
    const links = (await res.json()) as { creator: string; path: string; expiresAt: string }[];
    expect(links.map((l) => l.creator)).toEqual(["@maya", "@sam"]);
    for (const l of links) {
      expect(Object.keys(l).sort()).toEqual(["creator", "expiresAt", "path"]);
      const claims = await verifyRequestToken(l.path.replace("/submit/", ""), SECRET);
      expect(claims).toMatchObject({ campaignId: id, creator: l.creator });
    }

    const c = (await getCampaign(id))!;
    const byHandle = Object.fromEntries(c.creators!.map((x) => [x.handle, x.request]));
    expect(byHandle["@leo"]).toBeUndefined();
    for (const l of links) {
      const claims = await verifyRequestToken(l.path.replace("/submit/", ""), SECRET);
      expect(byHandle[l.creator]).toEqual({ nonce: claims!.nonce, sentAt: expect.any(String), expiresAt: l.expiresAt });
    }
    const stored = await readFile(join(dir, "campaigns", id, "campaign.json"), "utf8");
    for (const l of links) expect(stored).not.toContain(l.path.replace("/submit/", ""));
    expect(stored).not.toMatch(/submit|token|path/);
  });

  it("bulk: named creators (added if new, deduplicated), validation, preview and switched-off links", async () => {
    const id = await newCampaign("Bulk named");
    const res = await bulk.POST(json({ creators: ["new.one", "@New.One", "two"] }), params({ id }));
    expect(((await res.json()) as { creator: string }[]).map((l) => l.creator)).toEqual(["@new.one", "@two"]);
    expect((await getCampaign(id))!.creators!.map((c) => [c.handle, Boolean(c.request)])).toEqual([["@new.one", true], ["@two", true]]);

    expect((await bulk.POST(json({ creators: [] }), params({ id }))).status).toBe(400);
    expect((await bulk.POST(new Request("http://localhost/api", { method: "POST", body: "{nope" }), params({ id }))).status).toBe(400);
    expect((await bulk.POST(json({}), params({ id: "preview" }))).status).toBe(409);
    // Everyone has a request but no video: the default still includes them (a fresh link each).
    expect(((await (await bulk.POST(json({}), params({ id }))).json()) as unknown[]).length).toBe(2);

    vi.stubEnv("SCREEN_TIME_LINK_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect((await bulk.POST(json({}), params({ id }))).status).toBe(503);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
