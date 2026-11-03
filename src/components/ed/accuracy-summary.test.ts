import { describe, expect, it } from "vitest";
import data from "@/lib/accuracy-data.json";
import { clipLabel, clipName, clipVideoId, missSeconds, pct, pct0, sampleRows, scoresOf, summarize, targetName, weakest, type AccuracyData, type AccuracyRow } from "./accuracy-summary";

const row = (clip: string, target: string, truthSec: number, predictedSec: number, precision: number | null, recall: number | null): AccuracyRow => ({
  clip,
  target,
  truthSec,
  predictedSec,
  precision,
  recall,
});

const score = (mode: string, rows: AccuracyRow[]) => ({ mode, rows, precision: 0.9, recall: 0.9, f1: 0.9, meanAbsErrorSec: 0.5, falseSecondsOnEmptyClips: 0 });

// A re-measure on LaCroix clips: new ids and target names, a look-alike clip, an empty clip and two products in one shot.
const lacroix: AccuracyData = {
  measuredAt: "2026-11-04",
  fps: 15,
  scores: [
    score("sam", [
      row("lc-7b-ash", "lacroix-can", 13, 13.2, 0.98, 1),
      row("lc-10-aldo", "lacroix-can", 0, 6.4, 0, null),
      row("lc-3-empty", "lacroix-can", 0, 0, null, null),
      row("lc-12-aldo", "lacroix-can", 9, 14, 0.64, 1),
      row("lc-12-aldo", "poppi-can", 5, 5, 1, 1),
      row("lc-8-peter", "lacroix-can", 16, 16, 1, 1),
    ]),
    score("verified", [
      row("lc-7b-ash", "lacroix-can", 13, 13.2, 0.98, 1),
      row("lc-10-aldo", "lacroix-can", 0, 0, null, null),
      row("lc-3-empty", "lacroix-can", 0, 0, null, null),
      row("lc-12-aldo", "lacroix-can", 9, 9, 1, 1),
      row("lc-12-aldo", "poppi-can", 5, 4, 1, 0.8),
      row("lc-8-peter", "lacroix-can", 16, 16.5, 0.94, 0.97),
    ]),
  ],
};

describe("summarize", () => {
  it("counts clips, two-product clips and the clips that must score 0, from the rows alone", () => {
    const s = summarize(lacroix);
    expect(s).toMatchObject({ targets: 6, clips: 5, multiProductClips: 1, stockClips: 0, lookalikeClips: 1, emptyClips: 1, measuredAt: "2026-11-04" });
    expect(s.verified.mode).toBe("verified");
    expect(s.sam.mode).toBe("sam");
  });

  it("reads the checked-in data file without assuming its clips", () => {
    const s = summarize(data);
    expect(s.targets).toBe(s.verified.rows.length);
    expect(s.clips).toBeGreaterThan(0);
    expect(s.clips).toBeLessThanOrEqual(s.targets);
    expect(s.stockClips).toBe(new Set(s.verified.rows.filter((r) => r.clip.startsWith("stock/")).map((r) => r.clip)).size);
  });

  it("finds each mode by name, not by position", () => {
    const flipped = { ...lacroix, scores: [...lacroix.scores].reverse() };
    expect(scoresOf(flipped).verified.mode).toBe("verified");
    expect(scoresOf(flipped).sam.mode).toBe("sam");
  });
});

describe("weakest and missSeconds", () => {
  it("picks the lowest precision and a different row for the lowest recall", () => {
    const { verified } = scoresOf(lacroix);
    const w = weakest(verified.rows);
    expect(w.precision?.clip).toBe("lc-8-peter");
    expect(w.recall?.target).toBe("poppi-can");
  });

  it("names nothing when every row is perfect", () => {
    expect(weakest([row("a", "x", 2, 2, 1, 1)])).toEqual({ precision: undefined, recall: undefined });
  });

  it("turns precision and recall back into seconds over- and under-counted", () => {
    const m = missSeconds(row("a", "x", 10, 12, 0.75, 0.9));
    expect(m.extraSec).toBeCloseTo(3);
    expect(m.missedSec).toBeCloseTo(1);
    expect(missSeconds(row("b", "x", 0, 0, null, null))).toEqual({ extraSec: 0, missedSec: 0 });
  });
});

describe("sampleRows", () => {
  it("keeps the weakest rows and the must-be-0 clips, tagged and explained, and fills up with the clearest checks", () => {
    const rows = sampleRows(lacroix, 5);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => `${r.clip}:${r.target}`)).toEqual([
      "lc-7b-ash:lacroix-can",
      "lc-8-peter:lacroix-can",
      "lc-12-aldo:poppi-can",
      "lc-10-aldo:lacroix-can",
      "lc-3-empty:lacroix-can",
    ]);
    expect(rows[1].weak).toBe("precision");
    expect(rows[2]).toMatchObject({ weak: "recall", note: "One of two products in the same shot" });
    expect(rows[3]).toMatchObject({ zero: "lookalike", note: "Only a look-alike in shot, must count 0" });
    expect(rows[4]).toMatchObject({ zero: "empty", note: "No product in the video, must count 0" });
    expect(rows[0].weak).toBeUndefined();
  });

  it("lists a look-alike that was counted by mistake once, as the weakest precision", () => {
    const bad: AccuracyData = {
      ...lacroix,
      scores: [lacroix.scores[0], score("verified", [row("lc-10-aldo", "lacroix-can", 0, 2, 0, null), row("lc-7b-ash", "lacroix-can", 13, 13, 1, 1)])],
    };
    const rows = sampleRows(bad);
    expect(rows.filter((r) => r.clip === "lc-10-aldo")).toHaveLength(1);
    expect(rows.find((r) => r.clip === "lc-10-aldo")).toMatchObject({ weak: "precision", zero: "lookalike" });
  });

  it("never returns more rows than asked for or than exist", () => {
    expect(sampleRows(lacroix, 2)).toHaveLength(2);
    expect(sampleRows(lacroix, 50)).toHaveLength(6);
  });
});

describe("names and percentages", () => {
  it("reads target ids as product names and drops a clip's folder", () => {
    expect(targetName("lacroix-can")).toBe("LaCroix can");
    expect(targetName("stanley-tumbler")).toBe("Stanley tumbler");
    expect(clipName("stock/stock01")).toBe("stock01");
    expect(clipName("lc-7b-ash")).toBe("lc-7b-ash");
    // A measured LaCroix Reel reads as its creator and links to its campaign video; an unknown clip keeps its name.
    expect(clipLabel("lacroix/lc-7b-ash")).toBe("Ash, re-cut");
    expect(clipVideoId("lacroix/lc-7b-ash")).toBe("ash-recut");
    expect(clipVideoId("lacroix/lc-12-aldo")).toBe("aldo-2");
    expect(clipVideoId("lacroix/lc-6-michael")).toBeUndefined();
    expect(clipLabel("stock/stock01")).toBe("stock01");
  });

  it("formats measured fractions and says when there was nothing to measure", () => {
    expect(pct(0.97686)).toBe("97.7%");
    expect(pct(null)).toBe("n/a");
    expect(pct0(0.954)).toBe("95%");
    expect(pct0(null)).toBe("–");
  });
});
