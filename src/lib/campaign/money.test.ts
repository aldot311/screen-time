// Fees, pay/hold roll-ups and the fee routes. The routes run against a temp local store; no network.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TermResult, VideoReport } from "@/lib/types";
import { feeFor, payout, payoutLine, usd } from "./money";
import { getCampaign } from "./store";
import type { Campaign, VideoEntry } from "./types";

const term = (pass: boolean | null): TermResult => ({ term: { text: "t", rule: null }, pass, detail: "" }) as TermResult;
const report = (...passes: (boolean | null)[]) => ({ terms: passes.map(term) }) as unknown as VideoReport;
let n = 0;
const video = (creator: string, r: VideoReport | undefined, createdAt = `2026-10-29T00:00:${String(n++).padStart(2, "0")}Z`): VideoEntry =>
  ({ id: `v${n}`, campaignId: "c", creator, title: "x", videoUrl: "", status: r ? "done" : "uploaded", step: null, report: r, createdAt, updatedAt: createdAt }) as VideoEntry;

describe("fees", () => {
  const c: Pick<Campaign, "fee" | "creators"> = { fee: 400, creators: [{ handle: "@Maya", addedAt: "", fee: 250 }, { handle: "@leo", addedAt: "" }] };

  it("uses the creator's own fee, else the campaign's, matching handles case-insensitively", () => {
    expect(feeFor(c, "@maya")).toBe(250);
    expect(feeFor(c, "@leo")).toBe(400);
    expect(feeFor(c, "@stranger")).toBe(400);
    expect(feeFor({ creators: [] }, "@leo")).toBeNull();
  });

  it("formats dollars without cents unless there are some", () => {
    expect(usd(300)).toBe("$300");
    expect(usd(2800)).toBe("$2,800");
    expect(usd(99.5)).toBe("$99.50");
  });
});

describe("payout", () => {
  const c: Pick<Campaign, "fee" | "creators"> = { fee: 300, creators: [{ handle: "@big", addedAt: "", fee: 1000 }] };

  it("sums pay, hold and review by each creator's latest finished video", () => {
    const p = payout(c, [
      video("@a", report(true, true)),
      video("@big", report(true, false)),
      video("@b", report(true, null)),
      video("@c", report(false)),
      video("@c", report(true)), // a re-cut that passes replaces the miss
      video("@d", undefined), // not finished: not counted
    ]);
    expect(p.pay).toEqual({ creators: 2, amount: 600, noFee: 0 });
    expect(p.hold).toEqual({ creators: 1, amount: 1000, noFee: 0 });
    expect(p.review).toEqual({ creators: 1, amount: 300, noFee: 0 });
    expect(payoutLine(p)).toBe("Pay 2 creators $600 · hold 1 ($1,000) · review 1 ($300)");
  });

  it("shows no money line until a fee is set, and names creators without one", () => {
    expect(payoutLine(payout({ creators: [] }, [video("@a", report(true))]))).toBeNull();
    const mixed = payout({ creators: [{ handle: "@a", addedAt: "", fee: 200 }] }, [video("@a", report(true)), video("@b", report(true))]);
    expect(payoutLine(mixed)).toBe("Pay 2 creators $200 + 1 without a fee");
  });

  it("starts with Hold when nobody delivered", () => {
    expect(payoutLine(payout({ fee: 50 }, [video("@a", report(false))]))).toBe("Hold 1 ($50)");
  });
});

const campaigns = await import("@/app/api/campaigns/route");
const one = await import("@/app/api/campaigns/[id]/route");
const creators = await import("@/app/api/campaigns/[id]/creators/route");

describe("fee routes", () => {
  const params = <T extends object>(p: T) => ({ params: Promise.resolve(p) });
  const json = (body: unknown, method = "POST") =>
    new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  let dir = "";
  const savedEnv = { ...process.env };
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "st-money-"));
    process.env.SCREEN_TIME_STORE_DIR = dir;
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });
  afterAll(async () => {
    process.env = savedEnv;
    await rm(dir, { recursive: true, force: true });
  });

  it("stores the campaign fee from the form, rounds to cents, rejects nonsense and clears with null", async () => {
    const res = await campaigns.POST(
      json({ name: "Fees", brand: "B", prompt: "can", productDescription: "a can", brandTerms: [], contractTerms: [], fee: 300.004 }),
    );
    const { id } = (await res.json()) as Campaign;
    expect((await getCampaign(id))?.fee).toBe(300);

    expect((await one.PATCH(json({ fee: -5 }, "PATCH"), params({ id }))).status).toBe(400);
    expect((await one.PATCH(json({ fee: "300" }, "PATCH"), params({ id }))).status).toBe(400);
    expect((await one.PATCH(json({ fee: 450 }, "PATCH"), params({ id }))).status).toBe(200);
    expect((await getCampaign(id))?.fee).toBe(450);
    await one.PATCH(json({ fee: null }, "PATCH"), params({ id }));
    expect((await getCampaign(id))?.fee).toBeUndefined();
    expect((await one.PATCH(json({ fee: 1 }, "PATCH"), params({ id: "no-such-campaign" }))).status).toBe(404);
  });

  it("sets and clears a creator's own fee", async () => {
    const res = await campaigns.POST(json({ name: "Roster fees", brand: "B", prompt: "can", productDescription: "a can", brandTerms: [], contractTerms: [] }));
    const { id } = (await res.json()) as Campaign;
    await creators.POST(json({ handles: ["@maya"] }), params({ id }));
    expect((await creators.PATCH(json({ handle: "@MAYA", fee: 250 }, "PATCH"), params({ id }))).status).toBe(200);
    expect((await getCampaign(id))?.creators?.[0].fee).toBe(250);
    await creators.PATCH(json({ handle: "maya", fee: null }, "PATCH"), params({ id }));
    expect((await getCampaign(id))?.creators?.[0].fee).toBeUndefined();
  });
});
