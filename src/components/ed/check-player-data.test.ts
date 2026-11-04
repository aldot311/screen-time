import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import data from "@/lib/accuracy-data.json";
import { clipVideoId, scoresOf, type AccuracyData } from "./accuracy-summary";
import { checkReel, firstDisagreement, markSegments, packBoxes, soFar } from "./check-player-data";
import { CHECK_REELS } from "./check-player-sources";

const reel = (clip: string) => {
  const r = CHECK_REELS.find((x) => x.clip === `lacroix/${clip}`);
  if (!r) throw new Error(`no reel ${clip}`);
  return r;
};

describe("checkReel", () => {
  it("marks every frame from a label range (inclusive) and the counted frames", () => {
    const r = checkReel(
      { id: "x", targets: [{ name: "can", ranges: [[1, 3]] }] },
      {
        videoId: "x",
        info: { frameCount: 6 },
        metrics: { visibleFrames: [2, 3, 4] },
      },
    );
    expect(r.marks).toBe(".-==+.");
    expect(r).toMatchObject({
      labelledFrames: 3,
      countedFrames: 3,
      overFrames: 1,
      missFrames: 1,
      precision: 2 / 3,
      recall: 2 / 3,
    });
  });

  it("leaves precision unset when nothing was counted and recall unset when nothing is labelled", () => {
    const none = checkReel(
      { id: "x", targets: [{ name: "can", ranges: [] }] },
      { videoId: "x", info: { frameCount: 3 }, metrics: { visibleFrames: [] } },
    );
    expect(none.precision).toBeNull();
    expect(none.recall).toBeNull();
    expect(none.marks).toBe("...");
  });

  it("refuses a report without visibleFrames rather than guessing", () => {
    expect(() => checkReel({ id: "x", targets: [{ name: "can", ranges: [] }] }, { videoId: "x", info: {}, metrics: {} })).toThrow(/visibleFrames/);
  });
});

describe("the LaCroix Reels", () => {
  it("covers every labelled clip in data/labels/lacroix", () => {
    const files = readdirSync("data/labels/lacroix").filter((f) => /^lc-.*\.json$/.test(f));
    expect(CHECK_REELS.map((r) => r.clip.replace("lacroix/", "") + ".json").sort()).toEqual(files.sort());
  });

  it("scores each Reel exactly as the measured accuracy data does", () => {
    const { verified } = scoresOf(data as AccuracyData);
    for (const r of CHECK_REELS) {
      const row = verified.rows.find((x) => x.clip === r.clip && x.target === r.target);
      expect(row, r.clip).toBeDefined();
      expect(r.precision, r.clip).toBe(row!.precision);
      expect(r.recall, r.clip).toBe(row!.recall);
      expect(r.countedFrames / 15).toBeCloseTo(row!.predictedSec, 6);
      expect(r.labelledFrames / 15).toBeCloseTo(row!.truthSec, 6);
    }
  });

  it("is the campaign video the accuracy table links to", () => {
    for (const r of CHECK_REELS) expect(r.videoId, r.clip).toBe(clipVideoId(r.clip));
  });

  it("shows Michael's over-count: counted frames before the can is labelled, and no misses", () => {
    const m = reel("lc-1-michael");
    expect(m.overFrames).toBeGreaterThan(0);
    expect(m.missFrames).toBe(0);
    expect(m.marks).toMatch(/\+/);
    const first = firstDisagreement(m.marks);
    expect(first?.kind).toBe("over");
    expect(markSegments(m.marks, "+").length).toBeGreaterThan(0);
  });

  it("shows no disagreement on Peter's Reel", () => {
    const p = reel("lc-8-peter");
    expect(p.overFrames).toBe(0);
    expect(p.missFrames).toBe(0);
    expect(p.marks).not.toMatch(/[+-]/);
    expect(firstDisagreement(p.marks)).toBeNull();
  });

  it("shows George's Reel as all miss: labelled, never counted", () => {
    const g = reel("lc-1-george");
    expect(g.countedFrames).toBe(0);
    expect(g.missFrames).toBe(g.labelledFrames);
    expect(firstDisagreement(g.marks)?.kind).toBe("miss");
  });
});

describe("markSegments and soFar", () => {
  it("turns runs of frames into seconds", () => {
    expect(markSegments("..==+.", "=+", 15)).toEqual([{ startSec: 2 / 15, endSec: 5 / 15 }]);
    expect(markSegments("==", "=", 15)).toEqual([{ startSec: 0, endSec: 2 / 15 }]);
  });

  it("adds up only the frames that have started playing", () => {
    expect(soFar(".-=+..", 0)).toEqual({
      labelledSec: 0,
      countedSec: 0,
      overSec: 0,
      missSec: 0,
    });
    const s = soFar(".-=+..", 3.5 / 15);
    expect(s.labelledSec * 15).toBeCloseTo(2);
    expect(s.countedSec * 15).toBeCloseTo(2);
    expect(s.overSec * 15).toBeCloseTo(1);
    expect(s.missSec * 15).toBeCloseTo(1);
    expect(soFar("==", 99).countedSec * 15).toBeCloseTo(2);
  });
});

describe("packBoxes", () => {
  it("keeps only detections with a box, rounded", () => {
    expect(
      packBoxes([
        {
          frame: 3,
          objectId: 0,
          verdict: "match",
          confidence: 0.912,
          box: { x1: 1.4, y1: 2, x2: 30.6, y2: 40 },
        },
        { frame: 4, objectId: 1, verdict: "lookalike" },
      ]),
    ).toEqual([[3, 0, 1, 1, 2, 31, 40, 91]]);
  });
});
