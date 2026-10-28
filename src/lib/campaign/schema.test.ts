import { afterEach, describe, expect, it, vi } from "vitest";
import { isBlobUrl, NewCampaign, RegisterVideo } from "./schema";

const valid = {
  name: "Fall creators",
  brand: "Alani Nu",
  prompt: "drink can",
  productDescription: "a slim teal can",
  brandTerms: ["Alani", " ", "Alani Nu "],
  contractTerms: ["On screen at least 3 seconds in total", ""],
};

describe("NewCampaign", () => {
  it("accepts a campaign and drops blank lines", () => {
    const c = NewCampaign.parse(valid);
    expect(c.brandTerms).toEqual(["Alani", "Alani Nu"]);
    expect(c.contractTerms).toEqual(["On screen at least 3 seconds in total"]);
  });

  it("rejects missing, empty or wrongly typed fields", () => {
    expect(NewCampaign.safeParse({ ...valid, name: "  " }).success).toBe(false);
    expect(NewCampaign.safeParse({ ...valid, prompt: undefined }).success).toBe(false);
    expect(NewCampaign.safeParse({ ...valid, brandTerms: "Alani" }).success).toBe(false);
    expect(NewCampaign.safeParse({ ...valid, contractTerms: Array(21).fill("x") }).success).toBe(false);
    expect(NewCampaign.safeParse(null).success).toBe(false);
  });
});

describe("RegisterVideo", () => {
  const env = { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_AbC123_secret" } as unknown as NodeJS.ProcessEnv;
  const own = "https://abc123.public.blob.vercel-storage.com/campaigns/a/files/x.mp4";

  afterEach(() => vi.unstubAllEnvs());

  it("only accepts URLs in this app's own Blob store and adds the @ to a handle", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_AbC123_secret");
    const ok = RegisterVideo.parse({ url: own, creator: "aldo" });
    expect(ok.creator).toBe("@aldo");
    expect(RegisterVideo.safeParse({ url: "https://other.public.blob.vercel-storage.com/campaigns/a/files/x.mp4", creator: "@a" }).success).toBe(false);
    expect(RegisterVideo.safeParse({ url: "file:///etc/passwd", creator: "@a" }).success).toBe(false);
  });

  it("rejects other hosts, other stores, plain http, credentials and other campaigns' folders", () => {
    expect(isBlobUrl(own, "a", env)).toBe(true);
    expect(isBlobUrl(own, "b", env)).toBe(false);
    expect(isBlobUrl("https://evil.public.blob.vercel-storage.com/campaigns/a/files/x.mp4", "a", env)).toBe(false);
    expect(isBlobUrl("http://abc123.public.blob.vercel-storage.com/campaigns/a/x.mp4", "a", env)).toBe(false);
    expect(isBlobUrl("https://u:p@abc123.public.blob.vercel-storage.com/campaigns/a/x.mp4", "a", env)).toBe(false);
    expect(isBlobUrl("https://abc123.public.blob.vercel-storage.com.evil.example/campaigns/a/x.mp4", "a", env)).toBe(false);
    expect(isBlobUrl("https://169.254.169.254/latest", undefined, env)).toBe(false);
    expect(isBlobUrl(own, "a", {} as NodeJS.ProcessEnv)).toBe(false); // no store configured
  });
});
