import { describe, expect, it } from "vitest";
import { previewCampaign, previewVideos } from "./preview";

const byId = Object.fromEntries(previewVideos().map((v) => [v.id, v]));

describe("preview campaign", () => {
  it("is marked synthetic and lists the twelve local Alani Nu clips", () => {
    expect(previewCampaign()).toMatchObject({ id: "preview", synthetic: true, name: "Alani Nu: preview" });
    expect(Object.keys(byId)).toEqual([
      "clip01", "clip02", "clip03", "clip04", "clip05", "clip09", "clip10", "clip11", "clip12", "clip13", "clip14", "clip15",
    ]);
    for (const v of Object.values(byId)) {
      expect(v).toMatchObject({ synthetic: true, status: "done", campaignId: "preview", videoUrl: `/api/dev/video?id=${v.id}` });
      expect(v.report?.cost).toEqual({ samFrames: 0, usd: 0 });
      expect(v.report?.metrics.mentions).toEqual([]);
    }
  });

  it("turns labelled frames into sane metrics", () => {
    const m = byId.clip01.report!.metrics;
    expect(m.secondsOnScreen).toBeCloseTo(60 / 15); // frames 18..77
    expect(m.firstSeenSec).toBeCloseTo(18 / 15);
    expect(m.avgAreaFraction).toBeGreaterThanOrEqual(0.04);
    expect(m.avgAreaFraction).toBeLessThanOrEqual(0.12);
    for (const v of Object.values(byId)) {
      const r = v.report!;
      expect(r.metrics.shareOfVideo).toBeGreaterThanOrEqual(0);
      expect(r.metrics.shareOfVideo).toBeLessThanOrEqual(1);
      expect(r.metrics.prominenceScore).toBeGreaterThanOrEqual(0);
      expect(r.metrics.prominenceScore).toBeLessThanOrEqual(100);
      expect(r.metrics.secondsOnScreen).toBeLessThanOrEqual(r.info.durationSec);
      for (const d of r.detections ?? []) {
        expect(d.box.x1).toBeGreaterThanOrEqual(0);
        expect(d.box.x2).toBeLessThan(r.info.width);
        expect(d.box.y2).toBeLessThan(r.info.height);
      }
    }
  });

  it("shows nothing on screen for the empty clip and the rejected look-alike", () => {
    expect(byId.clip09.report!.metrics.secondsOnScreen).toBe(0);
    expect(byId.clip09.report!.tracks).toEqual([]);
    const c5 = byId.clip05.report!;
    expect(c5.metrics.secondsOnScreen).toBe(0);
    expect(c5.metrics.firstSeenSec).toBeNull();
    expect(c5.tracks).toEqual([
      { objectId: 1, verdict: "lookalike", visibility: "clear", reason: expect.stringContaining("Coconut-water can") },
    ]);
    expect(c5.detections!.length).toBeGreaterThan(0);
    expect(c5.detections!.every((d) => d.verdict === "lookalike")).toBe(true);
    expect(c5.terms.map((t) => t.pass)).toEqual([false, false, false]);
  });

  it("checks the three contract terms with the real rule code", () => {
    const terms = byId.clip02.report!.terms; // frames 0..179: 12 s, all of the first 5 s
    expect(terms.map((t) => t.term.rule?.kind)).toEqual(["min_seconds_total", "min_seconds_within", "min_continuous"]);
    expect(terms.map((t) => t.pass)).toEqual([true, true, true]);
    expect(byId.clip02.report!.detections!.every((d) => d.verdict === "match")).toBe(true);
  });

  it("hands out copies, so callers cannot change the shared preview", () => {
    previewVideos()[0].creator = "@changed";
    expect(previewVideos()[0].creator).toBe("@aldo.tile");
  });
});
