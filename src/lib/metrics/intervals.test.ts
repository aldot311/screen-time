import { describe, expect, it } from "vitest";
import { clipBootstrap, clopperPearson, scoresOf, seededRandom } from "./intervals";

describe("scoresOf", () => {
  it("scores summed frame counts like scripts/accuracy.mts", () => {
    expect(scoresOf({ tp: 9, fp: 1, fn: 0 })).toEqual({ precision: 0.9, recall: 1, f1: (2 * 0.9) / 1.9 });
    expect(scoresOf({ tp: 0, fp: 0, fn: 5 })).toEqual({ precision: null, recall: 0, f1: 0 });
    expect(scoresOf({ tp: 0, fp: 0, fn: 0 })).toEqual({ precision: null, recall: null, f1: null });
  });
});

describe("clipBootstrap", () => {
  const clips = [
    { tp: 160, fp: 0, fn: 8 },
    { tp: 39, fp: 7, fn: 0 },
    { tp: 0, fp: 0, fn: 0 },
    { tp: 180, fp: 0, fn: 0 },
    { tp: 0, fp: 0, fn: 168 },
    { tp: 210, fp: 3, fn: 1 },
  ];

  it("gives the same intervals for the same seed, on every run", () => {
    const a = clipBootstrap(clips, { seed: 20261103, resamples: 5_000 });
    const b = clipBootstrap(clips, { seed: 20261103, resamples: 5_000 });
    expect(a).toEqual(b);
    expect(seededRandom(7)()).toBe(seededRandom(7)());
  });

  it("brackets the point estimate, inside 0–100%", () => {
    const point = scoresOf(clips.reduce((s, c) => ({ tp: s.tp + c.tp, fp: s.fp + c.fp, fn: s.fn + c.fn })));
    const i = clipBootstrap(clips, { seed: 1, resamples: 5_000 });
    for (const k of ["precision", "recall", "f1"] as const) {
      expect(i[k]!.lo).toBeLessThanOrEqual(point[k]!);
      expect(i[k]!.hi).toBeGreaterThanOrEqual(point[k]!);
      expect(i[k]!.lo).toBeGreaterThanOrEqual(0);
      expect(i[k]!.hi).toBeLessThanOrEqual(1);
    }
  });

  it("has nothing to say about no clips", () => {
    expect(clipBootstrap([], { seed: 1, resamples: 10 })).toEqual({ precision: null, recall: null, f1: null });
  });
});

describe("clopperPearson", () => {
  // Checked against scipy's beta quantiles (judgefix/accuracy/clopper_pearson.py).
  it("gives the exact 95% interval for a count", () => {
    const all = clopperPearson(12, 12);
    expect(all.lo).toBeCloseTo(Math.pow(0.025, 1 / 12), 5);
    expect(all.hi).toBe(1);
    const eleven = clopperPearson(11, 12);
    expect(eleven.lo).toBeCloseTo(0.6152, 3);
    expect(eleven.hi).toBeCloseTo(0.9979, 3);
    const ten = clopperPearson(10, 12);
    expect(ten.lo).toBeCloseTo(0.5159, 3);
    expect(ten.hi).toBeCloseTo(0.9791, 3);
    expect(clopperPearson(0, 4).lo).toBe(0);
  });

  it("refuses a count that is not one", () => {
    expect(() => clopperPearson(3, 2)).toThrow();
    expect(() => clopperPearson(1, 0)).toThrow();
  });
});
