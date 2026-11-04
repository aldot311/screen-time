import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consentText, createRequestToken, linkSecret, requester, uploadNote, verifyRequestToken } from "./requests";
import { claimRequest, getCampaign, getVideo, listVideos, putCampaign, releaseRequest, requestUsed, takeUploadSlot } from "./store";
import { SHOWCASE_CAMPAIGN } from "./showcase";
import { TRY_ID } from "./try";
import { requestNonce, safeUploadName } from "./upload-name";

const campaigns = await import("@/app/api/campaigns/route");
const requests = await import("@/app/api/campaigns/[id]/requests/route");
const submit = await import("@/app/api/submit/[token]/route");

const SECRET = "a-long-enough-secret-for-request-links";
const claims = { campaignId: "fall", creator: "@maya", exp: 2_000_000_000, nonce: "abc123def456" };

describe("request link tokens", () => {
  it("round-trips and rejects tampering, the wrong secret, expiry and junk", async () => {
    const t = await createRequestToken(claims, SECRET);
    expect(await verifyRequestToken(t, SECRET, 1_900_000_000)).toEqual(claims);
    expect(await verifyRequestToken(t, "another-long-secret", 1_900_000_000)).toBeNull();
    expect(await verifyRequestToken(t, SECRET, 2_000_000_000)).toBeNull(); // expired
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, campaignId: "other" })).toString("base64url");
    expect(await verifyRequestToken(`${forged}.${sig}`, SECRET, 1)).toBeNull();
    expect(await verifyRequestToken(`${body}.${sig}x`, SECRET, 1)).toBeNull();
    expect(await verifyRequestToken(`${body}.${sig}.x`, SECRET, 1)).toBeNull();
    expect(await verifyRequestToken("garbage", SECRET, 1)).toBeNull();
    expect(await verifyRequestToken(t, null, 1)).toBeNull();
  });

  it("refuses claims that would escape their campaign or creator", async () => {
    for (const bad of [{ campaignId: "../x" }, { creator: "maya" }, { nonce: "short" }]) {
      expect(await verifyRequestToken(await createRequestToken({ ...claims, ...bad }, SECRET), SECRET, 1)).toBeNull();
    }
  });

  it("needs a dedicated 32+ character secret outside development, never the demo password", () => {
    const long = "x".repeat(32);
    expect(linkSecret({ NODE_ENV: "production" })).toBeNull();
    expect(linkSecret({ NODE_ENV: "production", SCREEN_TIME_PASSWORD: "a-very-long-demo-password-123456789" })).toBeNull();
    expect(linkSecret({ NODE_ENV: "production", SCREEN_TIME_LINK_SECRET: "too-short-secret" })).toBeNull();
    expect(linkSecret({ NODE_ENV: "production", SCREEN_TIME_LINK_SECRET: long })).toBe(long);
    expect(linkSecret({ NODE_ENV: "development" })).not.toBeNull();
  });
});

describe("what the creator is told and agrees to", () => {
  const MODELS = "with AI (Meta SAM 3.1, Muse Spark and Muse Voice Transcribe)";

  it("names the brand, and says its report is open to anyone visiting the site", () => {
    const fall = { id: "alani-nu-fall", brand: "Alani Nu" };
    expect(requester(fall)).toBe("Alani Nu");
    expect(consentText(fall)).toBe(
      `I agree that Alani Nu may analyze this video ${MODELS} to check the sponsorship terms, and show it in a report that anyone visiting this site can open.`,
    );
    expect(uploadNote(fall)).toBe("MP4 or MOV, up to 200 MB. It goes to Alani Nu; their report, with your video, can be opened by anyone visiting this site.");
  });

  it("names Screen-Time, never the brand on the can, and the public demo uses on the site's test campaigns", () => {
    for (const id of [SHOWCASE_CAMPAIGN, TRY_ID]) {
      const demo = { id, brand: "LaCroix" };
      expect(requester(demo)).toBe("Screen-Time");
      expect(consentText(demo)).toBe(
        `I agree that Screen-Time may analyze this video ${MODELS} for its LaCroix test campaign, and show it on the Screen-Time demo site, in its demo video and in its Meta hackathon submission.`,
      );
      expect(consentText(demo)).not.toContain("LaCroix may");
      expect(uploadNote(demo)).toBe("MP4 or MOV, up to 200 MB. It goes to Screen-Time, which shows it on the public Screen-Time demo site.");
    }
  });
});

describe("requestNonce", () => {
  it("reads the one-time id from a link and rejects junk", async () => {
    expect(requestNonce(await createRequestToken(claims, SECRET))).toBe(claims.nonce);
    expect(requestNonce("not-a-token")).toBeNull();
  });
});

describe("safeUploadName", () => {
  it("turns any file name into one the upload route accepts", () => {
    const ok = /^[\w.-]+\.(mp4|mov)$/;
    for (const [name, type] of [["final cut (2).MOV", "video/quicktime"], ["Été 🎬.mp4", "video/mp4"], ["...", "video/mp4"]]) {
      expect(safeUploadName({ name, type })).toMatch(ok);
    }
    expect(safeUploadName({ name: "final cut (2).MOV", type: "video/quicktime" })).toBe("final-cut-2.mov");
  });
});

describe("creator submissions", () => {
  let dir = "";
  const savedEnv = { ...process.env };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "st-submit-"));
    process.env.SCREEN_TIME_STORE_DIR = dir;
    process.env.SCREEN_TIME_LINK_SECRET = SECRET;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
  afterAll(async () => {
    process.env = savedEnv;
    await rm(dir, { recursive: true, force: true });
  });
  const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
  const post = (body: unknown) =>
    new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const fileForm = (consent: boolean) => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array([0, 0, 0, 1])], "final cut.mp4", { type: "video/mp4" }));
    if (consent) form.set("consent", "true");
    return new Request("http://localhost/api", { method: "POST", body: form });
  };
  async function campaignWithLink(name: string) {
    const c = await campaigns.POST(post({ name, brand: "Alani Nu", prompt: "drink can", productDescription: "a teal can", brandTerms: [], contractTerms: [] }));
    const { id } = (await c.json()) as { id: string };
    const link = await requests.POST(post({ creator: "maya" }), params({ id }));
    expect(link.status).toBe(201);
    return { id, token: ((await link.json()) as { path: string }).path.replace("/submit/", "") };
  }

  it("stores one consented video per link, as the link's creator, and never runs it", async () => {
    const { id, token } = await campaignWithLink("Fall");
    expect((await submit.POST(fileForm(false), params({ token }))).status).toBe(400);
    const ok = await submit.POST(fileForm(true), params({ token }));
    expect(ok.status).toBe(201);
    const video = await getVideo(id, ((await ok.json()) as { id: string }).id);
    expect(video).toMatchObject({ creator: "@maya", status: "uploaded", consent: { text: expect.stringContaining("Alani Nu") } });
    // The words on record are the ones the request page showed beside the box.
    expect(video?.consent?.text).toBe(consentText((await getCampaign(id))!));
    expect((await submit.POST(fileForm(true), params({ token }))).status).toBe(409);
    expect(await listVideos(id)).toHaveLength(1);
    expect((await submit.POST(fileForm(true), params({ token: `${token}x` }))).status).toBe(403);
  });

  it("records Screen-Time and the demo uses as the consent on the site's own test campaign", async () => {
    const campaign = await putCampaign({
      id: SHOWCASE_CAMPAIGN,
      name: "LaCroix: Strawberry Peach",
      brand: "LaCroix",
      prompt: "drink can",
      productDescription: "a pink LaCroix Strawberry Peach can",
      brandTerms: ["LaCroix"],
      contractTerms: [],
      createdAt: new Date().toISOString(),
    });
    const link = await requests.POST(post({ creator: "michael.k" }), params({ id: campaign.id }));
    expect(link.status).toBe(201);
    const token = ((await link.json()) as { path: string }).path.replace("/submit/", "");
    const ok = await submit.POST(fileForm(true), params({ token }));
    expect(ok.status).toBe(201);
    const video = await getVideo(campaign.id, ((await ok.json()) as { id: string }).id);
    expect(video?.consent?.text).toBe(consentText(campaign));
    expect(video?.consent?.text).toMatch(/^I agree that Screen-Time may analyze this video/);
    expect(video?.consent?.text).toContain("in its Meta hackathon submission");
  });

  it("refuses an empty file without using up the link", async () => {
    const { token } = await campaignWithLink("Empty");
    const form = new FormData();
    form.set("file", new File([], "empty.mp4", { type: "video/mp4" }));
    form.set("consent", "true");
    expect((await submit.POST(new Request("http://localhost/api", { method: "POST", body: form }), params({ token }))).status).toBe(400);
    expect((await submit.POST(fileForm(true), params({ token }))).status).toBe(201);
  });

  it("lets only one of several simultaneous uploads through a link land", async () => {
    const { id, token } = await campaignWithLink("Race");
    const codes = (await Promise.all(Array.from({ length: 5 }, () => submit.POST(fileForm(true), params({ token }))))).map((r) => r.status);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(4);
    expect(await listVideos(id)).toHaveLength(1);
  });

  it("caps upload tokens per link and can give a link back after a failed save", async () => {
    expect(await takeUploadSlot("slotsnonce01")).toBe(true);
    expect(await takeUploadSlot("slotsnonce01")).toBe(true);
    expect(await takeUploadSlot("slotsnonce01")).toBe(true);
    expect(await takeUploadSlot("slotsnonce01")).toBe(false);
    expect(await claimRequest("releasenonce", "v1")).toBe(true);
    await releaseRequest("releasenonce");
    expect(await requestUsed("releasenonce")).toBe(false);
    expect(await claimRequest("releasenonce", "v2")).toBe(true);
  });

  it("refuses to register anything but a video in the campaign's own files", async () => {
    process.env.BLOB_STORE_HOST = "store.public.blob.vercel-storage.com";
    const { id, token } = await campaignWithLink("Paths");
    const register = (url: string) => submit.POST(post({ url, consent: true }), params({ token }));
    expect((await register("https://evil.example/x.mp4")).status).toBe(400);
    expect((await register(`https://store.public.blob.vercel-storage.com/campaigns/${id}/campaign.json`)).status).toBe(400);
    expect((await register(`https://store.public.blob.vercel-storage.com/campaigns/other/files/x.mp4`)).status).toBe(400);
    // A video in the right folder that was not uploaded with this link (another creator's) is refused too.
    expect((await register(`https://store.public.blob.vercel-storage.com/campaigns/${id}/files/clip-abc.mp4`)).status).toBe(400);
    expect(await listVideos(id)).toHaveLength(0);
    delete process.env.BLOB_STORE_HOST;
  });
});
