// The campaign page rendered on the server, as a visitor and as the owner: the owner's controls show only behind the
// demo password, and campaign and report pages stay out of search results.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessToken } from "@/lib/access";
import { DEMO_NOTE } from "@/lib/campaign/demo-note";
import { SHOWCASE_CAMPAIGN } from "@/lib/campaign/showcase";
import { putCampaign } from "@/lib/campaign/store";
import type { Campaign } from "@/lib/campaign/types";

// The request's cookie jar, and a router for the client components the page renders.
const jar = vi.hoisted(() => ({ access: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.access === undefined ? undefined : { name, value: jar.access }) }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} }),
  usePathname: () => "/campaigns/fall",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
}));

const campaignPage = await import("./page");
const reportPage = await import("./videos/[videoId]/page");

const PASSWORD = "a-long-enough-demo-password";
const at = new Date().toISOString();
const fall: Campaign = {
  id: "fall",
  name: "Alani Nu: Fall creators",
  brand: "Alani Nu",
  prompt: "drink can",
  productDescription: "a teal Alani Nu can",
  brandTerms: ["Alani"],
  contractTerms: [],
  createdAt: at,
  fee: 300,
  creators: [{ handle: "@maya", addedAt: at }],
};

const render = async (id: string) =>
  renderToStaticMarkup(await campaignPage.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }));

describe("the campaign page", () => {
  let dir = "";
  const savedEnv = { ...process.env };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "st-campaign-page-"));
    process.env.SCREEN_TIME_STORE_DIR = dir;
    process.env.SCREEN_TIME_PASSWORD = PASSWORD;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await putCampaign(fall);
    await putCampaign({ ...fall, id: SHOWCASE_CAMPAIGN, name: "LaCroix: Strawberry Peach", brand: "LaCroix" });
  });
  afterAll(async () => {
    process.env = savedEnv;
    await rm(dir, { recursive: true, force: true });
  });
  beforeEach(() => {
    jar.access = undefined;
  });

  it("shows a visitor the campaign without the owner's controls, with one way to unlock and the CSV", async () => {
    const html = await render("fall");
    expect(html).toContain("@maya");
    expect(html).not.toMatch(/Remove @maya from the list/);
    expect(html).not.toMatch(/request link for @maya/);
    expect(html).not.toContain("Change it");
    expect(html).not.toContain("Add product photo");
    expect(html).not.toContain("Add creators");
    expect(html).not.toContain("Add videos");
    expect(html.match(/Unlock to edit/g)).toHaveLength(1);
    expect(html).toContain(`href="/unlock?next=${encodeURIComponent("/campaigns/fall")}"`);
    expect(html).toContain("Export CSV");
  });

  it("treats a wrong access cookie as a visitor", async () => {
    jar.access = "not-the-token";
    const html = await render("fall");
    expect(html).not.toMatch(/Remove @maya from the list/);
    expect(html).toContain("Unlock to edit");
  });

  it("shows the owner every control once the demo password is entered", async () => {
    jar.access = await accessToken(PASSWORD);
    const html = await render("fall");
    expect(html).toContain("Remove @maya from the list");
    expect(html).toContain("Make a request link for @maya");
    expect(html).toContain("Campaign fee per video: $300. Change it");
    expect(html).toContain("Add product photo");
    expect(html).toContain("Add creators");
    expect(html).toContain("Add videos");
    expect(html).toContain("Export CSV");
    expect(html).not.toContain("Unlock to edit");
  });

  it("says the site's own test campaign is not affiliated with the brands shown, and only there", async () => {
    expect(await render(SHOWCASE_CAMPAIGN)).toContain(DEMO_NOTE);
    expect(await render("fall")).not.toContain("Not affiliated");
  });

  it("keeps campaign and report pages out of search results, found or not", async () => {
    const searchParams = Promise.resolve({});
    for (const id of ["fall", "no-such-campaign"]) {
      expect((await campaignPage.generateMetadata({ params: Promise.resolve({ id }), searchParams })).robots).toEqual({ index: false });
      const report = await reportPage.generateMetadata({ params: Promise.resolve({ id, videoId: "no-such-video" }), searchParams });
      expect(report.robots).toEqual({ index: false });
    }
  });
});
