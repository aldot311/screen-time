import { describe, expect, it } from "vitest";
import data from "@/lib/accuracy-data.json";
import {
  clipLabel,
  clipLabelPlain,
  clipName,
  clipVideoId,
  contractEvalSummary,
  labelProvenance,
  missSeconds,
  objectRows,
  payHoldSummary,
  pct,
  pct0,
  peopleIn,
  rowForRun,
  sampleRows,
  scoresOf,
  setLine,
  sparkStory,
  spokenSummary,
  summarize,
  targetName,
  weakest,
  whereWrong,
  type AccuracyData,
  type AccuracyRow,
  type ContractEval,
} from "./accuracy-summary";

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
    // Michael K's Reel is the live upload in the demo, scored like the rest.
    expect(clipVideoId("lacroix/lc-6-michael")).toBe("6-michael-captioned-gk3bzd");
    expect(clipLabelPlain("lacroix/lc-1-michael")).toBe("Michael (not Michael K)");
    expect(clipLabelPlain("lacroix/lc-6-michael")).toBe("Michael K");
    expect(clipLabel("stock/stock01")).toBe("stock01");
  });

  it("formats measured fractions and says when there was nothing to measure", () => {
    expect(pct(0.97686)).toBe("97.7%");
    expect(pct(null)).toBe("n/a");
    expect(pct0(0.954)).toBe("95%");
    expect(pct0(null)).toBe("–");
  });
});

// The published file: the site's own 11 runs (data/runs) scored against data/labels/lacroix.
const site = data as AccuracyData;

describe("the measured set, in the page's words", () => {
  it("sizes the set from the data", () => {
    expect(setLine(site)).toBe("1,931 frames with the product in 2,800; 11 Reels; 9 people");
    expect(setLine({ ...site, set: undefined })).toBeNull();
    expect(peopleIn(["lacroix/lc-7a-ash", "lacroix/lc-7b-ash", "lacroix/lc-1-michael", "lacroix/lc-6-michael"])).toBe(3);
    expect(peopleIn(["stock/stock01"])).toBeNull();
  });

  it("says who labelled the clips from the label files, and never 'checked' until every clip was", () => {
    const none = labelProvenance(site)!;
    expect(none.line).toBe(
      "Labels: drafted by two independent Claude vision passes at 5 frames a second, then checked frame by frame by a person on all 11 clips.",
    );
    // Once a person has checked every clip frame by frame, the 5 fps sampling caveat no longer applies.
    expect(none.resolution).toBeNull();
    const some = labelProvenance({ ...site, labels: { clips: 11, checkedByPerson: 4, checkedBy: {} } })!;
    expect(some.line).toContain("checked frame by frame by a person: 4 of 11 clips.");
    expect(some.allChecked).toBe(false);
    const all = labelProvenance({ ...site, labels: { clips: 11, checkedByPerson: 11, checkedBy: {} } })!;
    expect(all.allChecked).toBe(true);
    expect(all.line).toContain("checked frame by frame by a person on all 11 clips");
    expect(labelProvenance({ ...site, labels: undefined })).toBeNull();
  });

  it("tells what Muse Spark changed, Reel by Reel, from the two scored modes", () => {
    const story = sparkStory(site).join(" ");
    expect(story).toMatch(/^Muse Spark changed the count on 2 of the 11 Reels\./);
    expect(story).toContain("On George’s Reel Muse Spark could not confirm the can SAM 3.1 tracked");
    expect(story).toContain("the report holds the fee and flags it for a person to look at");
    expect(story).toContain("On Aldo’s Reel, which the builder filmed, only a look-alike is in shot: LaCroix Pamplemousse");
    expect(story).toContain("Claude corrected that clip’s label at full resolution after the run");
    expect(story).toContain("Object by object, Muse Spark rejected both look-alikes that SAM 3.1 alone counts (2 of 2).");
  });

  it("lists hosted Muse Spark and SAM 3.1 alone object by object, with exact intervals", () => {
    const [hosted, alone] = objectRows(site, "muse-spark-1.3");
    expect(hosted).toMatchObject({ name: "Muse Spark 1.3 (hosted)", correct: 11, of: 12, lookalikes: 0, missed: 1, missedNote: "unclear" });
    expect(hosted.interval!.lo).toBeCloseTo(0.6152, 3);
    expect(alone).toMatchObject({ name: "SAM 3.1 alone (every tracked object counts)", correct: 10, of: 12, lookalikes: 2, missed: 0 });
    expect(objectRows({ ...site, objects: null }, "x")).toEqual([]);
  });

  it("compares pay or hold with what the labels imply, naming the Reels that differ", () => {
    const p = payHoldSummary(site)!;
    expect(p.line).toBe("Pay or hold on the on-screen term (at least 3.0 s in total) agrees with the labels on 9 of 11 Reels.");
    expect(p.differ).toEqual([
      "George: 11.2 s labelled, 0.0 s counted, so the labels say pay and the report says hold",
      "Michael (not Michael K): 2.6 s labelled, 3.0 s counted, so the labels say hold and the report says pay",
    ]);
    expect(payHoldSummary({ ...site, payHold: undefined })).toBeNull();
  });

  it("finds where it is wrong in the data, with what the report did about it", () => {
    const [over, under] = whereWrong(site);
    expect(over.clip).toBe("Michael (not Michael K) · LaCroix can");
    expect(over.what).toContain("(labelled 2.6 s, counted 3.0 s)");
    expect(under.clip).toBe("George · LaCroix can");
    expect(under.what).toContain("(labelled 11.2 s, counted 0.0 s)");
    expect(under.why).toContain("by the labels this Reel should pay, and the report says hold");
    expect(under.why).toContain("The report flags it");
    // George's recall is 0, so the card says all of it was missed; Michael over-counted only part of his.
    expect(under.title).toBe("Missed all of it");
    expect(over.title).toBe("Counted more than was there");
  });

  it("says some of it was missed when the weakest recall is above zero", () => {
    const scores = site.scores.map((s) => ({ ...s, rows: s.rows.map((r) => (r.recall === 0 ? { ...r, recall: 0.5 } : r)) }));
    const [, under] = whereWrong({ ...site, scores });
    expect(under.title).toBe("Missed some of it");
  });

  it("shows George's delivered row and links Michael K's on the landing page", () => {
    const rows = sampleRows(site);
    expect(rows.find((r) => r.clip === "lacroix/lc-1-george")).toMatchObject({ truthSec: 11.2, predictedSec: 0, weak: "recall" });
    expect(rows.find((r) => r.clip === "lacroix/lc-1-george")!.note).toMatch(/could not confirm/);
    expect(rows.every((r) => clipVideoId(r.clip))).toBe(true);
  });

  it("finds a report's own row only by its exact run", () => {
    const george = site.reports!.find((r) => r.clip === "lacroix/lc-1-george")!;
    expect(rowForRun(site, george.runId)?.clip).toBe("lacroix/lc-1-george");
    expect(rowForRun(site, "george-another-run")).toBeUndefined();
    expect(rowForRun(site, undefined)).toBeUndefined();
  });

  it("shows the spoken terms only once a person labelled every clip", () => {
    expect(spokenSummary(site)).toBeNull();
    const spoken = {
      labelled: 11,
      of: 11,
      brand: { agree: 10, of: 11, timed: 9, meanAbsErrorSec: 0.42, maxAbsErrorSec: 1.1 },
      disclosure: { agree: 9, of: 11, said: { agree: 10, of: 11 }, shown: { agree: 11, of: 11 } },
    };
    expect(spokenSummary({ ...site, spoken: { ...spoken, labelled: 10 } })).toBeNull();
    expect(spokenSummary({ ...site, spoken })).toEqual([
      "Brand said out loud: the app agrees with the person on 10 of 11 Reels; where both heard it, the first mention was 0.4 s off on average (at most 1.1 s).",
      "Ad disclosure: the app agrees with the person on 9 of 11 Reels (said aloud 10 of 11, shown on screen 11 of 11).",
    ]);
  });
});

describe("contractEvalSummary", () => {
  it("says nothing until the eval has run", () => {
    expect(contractEvalSummary(null)).toBeNull();
  });

  it("summarizes the committed eval run", async () => {
    const file = (await import("@/lib/contract-eval-data.json")).default as ContractEval | null;
    expect(file).not.toBeNull();
    expect(contractEvalSummary(file)).not.toBeNull();
  });

  it("states a filled eval in plain figures, counting clauses by their worst reading", () => {
    const e: ContractEval = {
      measuredAt: "2026-11-04",
      model: "muse-spark-1.3",
      runsPerCase: 6,
      expected: { total: 21, exact: 19, safeMiss: 1, misread: 1 },
      mustRefuse: { total: 9, refused: 8, passedThrough: 1 },
      live: { total: 3, exact: 3 },
      costUsd: 0.4,
      rows: Array.from({ length: 30 }, () => ({})),
    };
    expect(contractEvalSummary(e)).toEqual({
      headline: "30 plain-English clauses, each read 6 times: 19 of the 21 with one right reading were read exactly every time.",
      lines: [
        "Clauses with one right reading: 19 of 21 exact in every reading, 1 misread (a wrong rule), 1 left for a person.",
        "Clauses the video cannot settle: 8 of 9 refused in every reading, so a person checks them; turned into a rule once.",
        "The terms of this site's campaigns: 3 of 3 exact in every reading.",
      ],
      footnote: "muse-spark-1.3, measured 2026-11-04, $0.40 for the whole eval.",
    });
  });
});
