// Who may get a Blob client-upload token for which path. Token signing is local, so nothing leaves the process.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessToken } from "@/lib/access";
import { createRequestToken } from "./requests";

const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie.value === undefined ? undefined : { value: cookie.value }) }),
}));
// The Blob backend would go over the network; only these three store calls are reached.
vi.mock("./store", async (orig) => ({
  ...(await orig<typeof import("./store")>()),
  getCampaign: async (id: string) => (id === "fall" ? { id } : null),
  requestUsed: async () => false,
  takeUploadSlot: async () => true,
}));

const route = await import("@/app/api/blob-upload/route");

const PASSWORD = "a-demo-password-long-enough";
const SECRET = "a-long-enough-secret-for-request-links";
const savedEnv = { ...process.env };
beforeAll(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_secretpart";
  process.env.SCREEN_TIME_PASSWORD = PASSWORD;
  process.env.SCREEN_TIME_LINK_SECRET = SECRET;
});
afterAll(() => {
  process.env = savedEnv;
});
beforeEach(() => {
  cookie.value = undefined;
});

const ask = (pathname: string, clientPayload: string | null = null) =>
  route.POST(
    new Request("http://localhost/api/blob-upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, clientPayload, multipart: false } }),
    }),
  );

/** The options signed into a client token (its payload is base64 JSON after the signature). */
async function tokenOptions(res: Response) {
  expect(res.status).toBe(200);
  const { clientToken } = (await res.json()) as { clientToken: string };
  const inner = Buffer.from(clientToken.replace(/^vercel_blob_client_teststore_/, ""), "base64").toString();
  return JSON.parse(Buffer.from(inner.split(".")[1], "base64").toString()) as {
    pathname: string;
    allowedContentTypes: string[];
    maximumSizeInBytes: number;
  };
}

const creatorLink = () =>
  createRequestToken({ campaignId: "fall", creator: "@maya", exp: Math.floor(Date.now() / 1000) + 3600, nonce: "abc123def456" }, SECRET);

describe("POST /api/blob-upload", () => {
  it("gives the brand a product-photo token limited to images of 8 MB", async () => {
    cookie.value = await accessToken(PASSWORD);
    const opts = await tokenOptions(await ask("campaigns/fall/files/product-can.png"));
    expect(opts).toMatchObject({
      pathname: "campaigns/fall/files/product-can.png",
      allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
      maximumSizeInBytes: 8 * 1024 * 1024,
    });
    // Videos keep their own limits.
    const video = await tokenOptions(await ask("campaigns/fall/files/clip.mp4"));
    expect(video.allowedContentTypes).toEqual(["video/mp4", "video/quicktime"]);
    expect(video.maximumSizeInBytes).toBe(200 * 1024 * 1024);
  });

  it("refuses the preview and unknown campaigns on every branch", async () => {
    cookie.value = await accessToken(PASSWORD);
    for (const path of ["product-can.png", "product-can.jpeg", "clip.mp4"]) {
      expect((await ask(`campaigns/preview/files/${path}`)).status, path).toBe(400);
      expect((await ask(`campaigns/gone/files/${path}`)).status, path).toBe(400);
    }
    expect((await ask("campaigns/fall/files/notes.txt")).status).toBe(400);
    cookie.value = undefined;
    const previewLink = await createRequestToken(
      { campaignId: "preview", creator: "@maya", exp: Math.floor(Date.now() / 1000) + 3600, nonce: "abc123def456" },
      SECRET,
    );
    expect((await ask("campaigns/preview/files/req-abc123def456-final.mp4", previewLink)).status).toBe(400);
    expect((await ask("campaigns/preview/files/product-can.png", previewLink)).status).toBe(400);
  });

  it("never gives a creator's request link a product-photo token", async () => {
    const link = await creatorLink();
    expect((await ask("campaigns/fall/files/product-can.png", link)).status).toBe(401);
    // An image named after the link is neither a video nor a product-photo path, so it is refused outright.
    expect((await ask("campaigns/fall/files/req-abc123def456-product-can.png", link)).status).toBe(400);
    // Without the cookie or a link, nothing.
    expect((await ask("campaigns/fall/files/product-can.png")).status).toBe(401);
    // A wrong cookie is no better.
    cookie.value = "nope";
    expect((await ask("campaigns/fall/files/product-can.webp", link)).status).toBe(401);
  });

  it("still lets the creator's link upload its own video", async () => {
    const opts = await tokenOptions(await ask("campaigns/fall/files/req-abc123def456-final.mp4", await creatorLink()));
    expect(opts.allowedContentTypes).toEqual(["video/mp4", "video/quicktime"]);
  });
});
