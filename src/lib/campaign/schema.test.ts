import { describe, expect, it } from "vitest";
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
  it("only accepts Vercel Blob https URLs and adds the @ to a handle", () => {
    const ok = RegisterVideo.parse({ url: "https://abc.public.blob.vercel-storage.com/campaigns/a/files/x.mp4", creator: "aldo" });
    expect(ok.creator).toBe("@aldo");
    expect(isBlobUrl("http://abc.public.blob.vercel-storage.com/x.mp4")).toBe(false);
    expect(isBlobUrl("https://blob.vercel-storage.com.evil.example/x.mp4")).toBe(false);
    expect(isBlobUrl("https://169.254.169.254/latest")).toBe(false);
    expect(RegisterVideo.safeParse({ url: "file:///etc/passwd", creator: "@a" }).success).toBe(false);
  });
});
