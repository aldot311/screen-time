// Fees, pay/hold roll-ups and the fee routes. The routes run against a temp local store; no network.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TermResult, VideoReport } from "@/lib/types";
import { creatorEntry } from "@/components/ed/campaign-ui";
import { feeFor, handleKey, payout, payoutLine, rollup, usd } from "./money";
import { getCampaign, getVideo, putVideo } from "./store";
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
    expect(usd(10.1 + 20.9)).toBe("$31"); // float noise never shows as cents
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

  it("says a bucket has no fee instead of $0", () => {
    const p = payout({ creators: [{ handle: "@a", addedAt: "", fee: 200 }] }, [video("@a", report(false)), video("@b", report(true))]);
    expect(payoutLine(p)).toBe("Pay 1 creator no fee set · hold 1 ($200)");
  });

  it("counts a manager's override instead of the recommendation", () => {
    const v = { ...video("@a", report(true)), override: { decision: "hold" as const, reason: "wrong flavor in the end card", at: "" } };
    expect(payoutLine(payout({ fee: 100 }, [v]))).toBe("Hold 1 ($100)");
  });

  it("counts every finished video on its own for a test set", () => {
    const p = payout({ fee: 300 }, [video("@a", report(true)), video("@a", report(false)), video("@a", report(false)), video("@a", undefined)], { perVideo: true });
    expect(payoutLine(p, "video")).toBe("Pay 1 video $300 · hold 2 ($600)");
  });

  it("starts with Hold when nobody delivered", () => {
    expect(payoutLine(payout({ fee: 50 }, [video("@a", report(false))]))).toBe("Hold 1 ($50)");
  });
});

describe("rollup", () => {
  // The friends' LaCroix campaign as built by scripts/build-lacroix.mts: ten roster names, ten videos in upload order,
  // Ash's first take (never said LaCroix) and later her re-cut that met every term, and Michael K yet to upload.
  const ROSTER = ["George", "Michael", "Jamal", "Lana", "Ash", "Peter", "Aldo", "Jon", "Aldo 2", "Michael K"];
  const lacroix: Pick<Campaign, "fee" | "creators"> = { fee: 300, creators: ROSTER.map((handle) => ({ handle, addedAt: "" })) };
  const pass = () => report(true, true, true);
  const miss = () => report(true, false, true);
  const UPLOADS = [
    ["george", "George", miss],
    ["michael", "Michael", pass],
    ["jamal", "Jamal", pass],
    ["lana", "Lana", pass],
    ["ash", "Ash", miss],
    ["peter", "Peter", miss],
    ["aldo", "Aldo", miss],
    ["jon", "Jon", pass],
    ["aldo-2", "Aldo 2", pass],
    ["ash-recut", "Ash", pass],
  ] as const;
  const lacroixVideos = () => UPLOADS.map(([id, creator, r], i) => ({ ...video(creator, r(), `2026-11-02T06:${String(i).padStart(2, "0")}:00Z`), id }));

  it("counts each creator once, from their newest video, and adds up to the roster", () => {
    const r = rollup(lacroix, lacroixVideos());
    expect(r).toMatchObject({ unit: "creator", total: 10, delivered: 6, short: 3, review: 0 });
    expect(r.pending).toEqual({ creators: 1, amount: 300, noFee: 0 });
    expect(r.replacedBy.size).toBe(1);
    expect(r.replacedBy.get("ash")?.id).toBe("ash-recut");
    expect(r.payout.pay).toEqual({ creators: 6, amount: 1800, noFee: 0 });
    expect(r.payout.hold).toEqual({ creators: 3, amount: 900, noFee: 0 });
    expect(r.payout.review.creators).toBe(0);
    expect(payoutLine(r.payout, r.unit, r.pending)).toBe("Pay 6 creators $1,800 · hold 3 ($900) · 1 pending ($300)");
    // 6 + 3 + 1 = 10 creators, $1,800 + $900 + $300 = 10 × $300.
    expect(r.payout.pay.amount + r.payout.hold.amount + r.pending.amount).toBe(3000);
  });

  it("makes a creator pending while their re-cut is not checked, and counts Michael K once he uploads", () => {
    const vids = lacroixVideos();
    vids[9] = { ...vids[9], status: "running", report: undefined };
    const r = rollup(lacroix, [...vids, { ...video("michael k", pass(), "2026-11-02T06:30:00Z"), id: "michael-k" }]);
    // Ash's re-cut is running: her first take no longer decides, and she is pending until it finishes.
    expect(r.replacedBy.get("ash")?.id).toBe("ash-recut");
    expect(r).toMatchObject({ total: 10, delivered: 6, short: 3 });
    expect(r.pending.creators).toBe(1);
    expect(payoutLine(r.payout, r.unit, r.pending)).toBe("Pay 6 creators $1,800 · hold 3 ($900) · 1 pending ($300)");
  });

  it("ignores a manager's call saved on a take a re-cut replaced", () => {
    const vids = lacroixVideos();
    vids[4] = { ...vids[4], override: { decision: "pay", reason: "close enough", at: "" } };
    expect(rollup(lacroix, vids).payout).toEqual(rollup(lacroix, lacroixVideos()).payout);
  });

  it("says when a paid creator is one to pay only after a look", () => {
    const blurred = { ...pass(), tracks: [{ verdict: "match", visibility: "blurred" }] } as unknown as VideoReport;
    const r = rollup({ fee: 300 }, [video("@a", blurred), video("@b", pass()), { ...video("@c", blurred), override: { decision: "pay" as const, reason: "watched it", at: "" } }]);
    expect(payoutLine(r.payout, r.unit, r.pending)).toBe("Pay 3 creators $900 (1 after a look)");
  });

  it("counts a test set (one handle, no roster) by video, and never replaces one clip with another", () => {
    const clips = Array.from({ length: 12 }, (_, i) => video("@aldo.tile", i === 11 ? undefined : i < 5 ? pass() : miss()));
    const r = rollup({ fee: 300 }, clips);
    expect(r).toMatchObject({ unit: "video", total: 12, delivered: 5, short: 6, review: 0 });
    expect(r.replacedBy.size).toBe(0);
    expect(r.pending.creators).toBe(1);
    expect(payoutLine(r.payout, r.unit, r.pending)).toBe("Pay 5 videos $1,500 · hold 6 ($1,800) · 1 pending ($300)");
  });

  it("keeps the earlier take deciding when a re-cut stops, so the hold can still be decided", () => {
    const c = { fee: 300, creators: [{ handle: "Ash", addedAt: "" }] };
    const first = { ...video("Ash", miss(), "2026-10-29T00:01:00Z"), id: "take-1" };
    const stopped = { ...video("@Ash", undefined, "2026-10-29T00:02:00Z"), id: "take-2", status: "failed" as const };
    const r = rollup(c, [first, stopped]);
    expect(r.deciding.map((v) => v.id)).toEqual([first.id]);
    expect(r.replacedBy.size).toBe(0);
    expect(r.pending.creators).toBe(0);
    expect(payoutLine(r.payout, r.unit)).toBe("Hold 1 ($300)");
    expect(creatorEntry(c.creators[0], [first, stopped], "c", Date.parse("2026-10-30T00:00:00Z")).status).toBe("short");
    // Control: a re-cut that is still running does replace it, and the creator is pending.
    const running = { ...stopped, status: "running" as const };
    expect(rollup(c, [first, running]).pending.creators).toBe(1);
  });

  it("always adds up, and agrees with the Creators panel on who is still pending", () => {
    // A small seeded generator, so a failure names a fixture that can be replayed.
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
    const names = ["Ash", "ash", "@Maya", "@maya", "Leo", "Kim", "Jo"];
    const statuses = ["done", "done", "done", "running", "uploaded", "failed"] as const;
    for (let round = 0; round < 300; round++) {
      const roster = [...new Set(names.filter(() => rand() < 0.3).map(handleKey))].map((handle) => ({ handle, addedAt: "", fee: rand() < 0.3 ? 500 : undefined }));
      const c: Pick<Campaign, "fee" | "creators"> = { fee: rand() < 0.8 ? 300 : undefined, creators: roster };
      const vids = Array.from({ length: Math.floor(rand() * 8) }, (_, i) => {
        const status = pick(statuses);
        const r = status === "done" ? pick([pass(), miss(), report(true, null)]) : undefined;
        const v = { ...video(pick(names), r, `2026-10-29T00:0${Math.floor(rand() * 4)}:00Z`), id: `r${round}-${i}`, status };
        return rand() < 0.2 && r ? { ...v, override: { decision: pick(["pay", "hold"] as const), reason: "seen", at: "" } } : v;
      });
      const r = rollup(c, vids);
      const p = r.payout;
      const label = `round ${round}`;
      expect(r.delivered + r.short + r.review + r.pending.creators, label).toBe(r.total);
      expect(p.pay.creators + p.hold.creators + p.review.creators + r.pending.creators, label).toBe(r.total);
      // Every finished video either decides or was replaced by a newer take.
      expect(r.deciding.length + r.replacedBy.size, label).toBe(vids.filter((v) => v.status === "done" && v.report).length);
      // The money is each counted creator's fee, once.
      const keys = r.unit === "video" ? vids.map((v) => v.creator) : [...new Set([...roster.map((x) => x.handle), ...vids.map((v) => handleKey(v.creator))])];
      const fees = keys.map((h) => feeFor(c, h));
      expect(p.pay.amount + p.hold.amount + p.review.amount + r.pending.amount, label).toBe(fees.reduce<number>((s, f) => s + (f ?? 0), 0));
      expect(p.pay.noFee + p.hold.noFee + p.review.noFee + r.pending.noFee, label).toBe(fees.filter((f) => f === null).length);
      if (r.unit === "video") expect(r.replacedBy.size, label).toBe(0);
      const decided = new Set(r.deciding.map((v) => handleKey(v.creator)));
      for (const x of roster) {
        const panel = creatorEntry(x, vids, "c", Date.parse("2026-10-30T00:00:00Z")).status;
        expect(["delivered", "short", "review"].includes(panel), `${label} ${x.handle}: ${panel}`).toBe(decided.has(handleKey(x.handle)));
      }
    }
  });
});

const campaigns = await import("@/app/api/campaigns/route");
const one = await import("@/app/api/campaigns/[id]/route");
const creators = await import("@/app/api/campaigns/[id]/creators/route");
const override = await import("@/app/api/campaigns/[id]/videos/[videoId]/override/route");

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
    expect((await creators.PATCH(json({ handle: "@nobody", fee: 5 }, "PATCH"), params({ id }))).status).toBe(404);
  });

  it("records a manager's override beside the result, refuses unfinished videos, and removes it", async () => {
    const res = await campaigns.POST(json({ name: "Overrides", brand: "B", prompt: "can", productDescription: "a can", brandTerms: [], contractTerms: [] }));
    const { id } = (await res.json()) as Campaign;
    const base = { campaignId: id, creator: "@a", title: "x.mp4", videoUrl: "", step: null, createdAt: "2026-10-29T00:00:00Z", updatedAt: "" };
    await putVideo({ ...base, id: "done1", status: "done", report: report(true) });
    await putVideo({ ...base, id: "busy1", status: "running" });
    const p = (videoId: string) => params({ id, videoId });

    expect((await override.POST(json({ decision: "hold", reason: "ok" }), p("done1"))).status).toBe(400); // reason too short
    expect((await override.POST(json({ decision: "maybe", reason: "the logo is covered" }), p("done1"))).status).toBe(400);
    expect((await override.POST(json({ decision: "hold", reason: "the logo is covered" }), p("busy1"))).status).toBe(409);
    expect((await override.POST(json({ decision: "hold", reason: "the logo is covered" }), p("nope1"))).status).toBe(404);

    expect((await override.POST(json({ decision: "hold", reason: "  the logo is covered " }), p("done1"))).status).toBe(200);
    const saved = await getVideo(id, "done1");
    expect(saved?.override).toMatchObject({ decision: "hold", reason: "the logo is covered" });
    expect(saved?.report?.terms[0].pass).toBe(true); // the result itself is untouched

    expect((await override.DELETE(json(null, "DELETE"), p("done1"))).status).toBe(200);
    expect((await getVideo(id, "done1"))?.override).toBeUndefined();
  });

  it("refuses a new call on a take a re-cut replaced, but still lets one saved earlier be undone", async () => {
    const res = await campaigns.POST(json({ name: "Re-cuts", brand: "B", prompt: "can", productDescription: "a can", brandTerms: [], contractTerms: [] }));
    const { id } = (await res.json()) as Campaign;
    await creators.POST(json({ handles: ["@a"] }), params({ id }));
    const base = { campaignId: id, creator: "@a", title: "x.mp4", videoUrl: "", step: null, status: "done" as const, updatedAt: "" };
    const p = (videoId: string) => params({ id, videoId });
    const reason = { decision: "pay", reason: "the logo is covered" };

    await putVideo({ ...base, id: "take1", report: report(false), createdAt: "2026-10-29T00:00:00Z" });
    expect((await override.POST(json(reason), p("take1"))).status).toBe(200);
    await putVideo({ ...base, id: "take2", creator: "@A", report: report(true), createdAt: "2026-10-29T00:01:00Z" });

    const refused = await override.POST(json(reason), p("take1"));
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: string }).error).toMatch(/newer take/);
    expect((await override.DELETE(json(null, "DELETE"), p("take1"))).status).toBe(200);
    expect((await getVideo(id, "take1"))?.override).toBeUndefined();
    expect((await override.POST(json(reason), p("take2"))).status).toBe(200);
  });

  it("lets every clip of a test set (one handle, no roster) be decided on its own", async () => {
    const res = await campaigns.POST(json({ name: "Test set", brand: "B", prompt: "can", productDescription: "a can", brandTerms: [], contractTerms: [] }));
    const { id } = (await res.json()) as Campaign;
    const base = { campaignId: id, creator: "@a", title: "x.mp4", videoUrl: "", step: null, status: "done" as const, report: report(true), updatedAt: "" };
    await putVideo({ ...base, id: "clip1", createdAt: "2026-10-29T00:00:00Z" });
    await putVideo({ ...base, id: "clip2", createdAt: "2026-10-29T00:01:00Z" });
    expect((await override.POST(json({ decision: "hold", reason: "the logo is covered" }), params({ id, videoId: "clip1" }))).status).toBe(200);
  });
});
