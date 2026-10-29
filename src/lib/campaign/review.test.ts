import { describe, expect, it } from "vitest";
import type { TermResult, VideoReport } from "@/lib/types";
import { reviewFlags } from "./review";

const report = (over: Omit<Partial<VideoReport>, "metrics"> & { metrics?: Partial<VideoReport["metrics"]> }): VideoReport =>
  ({
    tracks: [],
    terms: [],
    ...over,
    metrics: { secondsOnScreen: 0, longestRunSec: 0, firstSeenSec: null, segments: [], mentions: [], ...over.metrics },
  }) as unknown as VideoReport;
const term = (text: string, rule: TermResult["term"]["rule"], pass: boolean | null = true): TermResult => ({ term: { text, rule }, pass, evidence: [], detail: "" });

describe("reviewFlags", () => {
  it("flags a blurred match and an object Muse Spark could not name", () => {
    const flags = reviewFlags(
      report({
        tracks: [
          { objectId: 0, verdict: "match", visibility: "blurred", reason: "" },
          { objectId: 1, verdict: "unclear", visibility: "partial", reason: "" },
          { objectId: 2, verdict: "match", visibility: "clear", reason: "" },
        ],
      }),
    );
    expect(flags).toEqual(["Muse Spark saw the product (object 1) blurred.", "Muse Spark could not tell what object 2 is, so it was not counted."]);
  });

  it("flags a measurement near its threshold, on either side, and leaves clear wins alone", () => {
    const near = reviewFlags(report({ metrics: { secondsOnScreen: 3.2 }, terms: [term("3 s on screen", { kind: "min_seconds_total", seconds: 3 })] }));
    expect(near).toEqual(["“3 s on screen”: 3.2 s on screen in total, against 3 s needed. Close either way."]);
    const below = reviewFlags(report({ metrics: { secondsOnScreen: 2.6 }, terms: [term("3 s", { kind: "min_seconds_total", seconds: 3 }, false)] }));
    expect(below).toHaveLength(1);
    expect(reviewFlags(report({ metrics: { secondsOnScreen: 9 }, terms: [term("3 s", { kind: "min_seconds_total", seconds: 3 })] }))).toEqual([]);
  });

  it("measures 'within the first' from the segments, and skips terms it cannot measure", () => {
    const flags = reviewFlags(
      report({
        metrics: { segments: [{ startSec: 0.5, endSec: 2.4 }, { startSec: 6, endSec: 9 }] },
        terms: [
          term("2 s in the first 5", { kind: "min_seconds_within", seconds: 2, withinFirstSec: 5 }),
          term("say it", { kind: "mentioned", minTimes: 1 }),
          term("unreadable", null, null),
        ],
      }),
    );
    expect(flags).toEqual(["“2 s in the first 5”: 1.9 s on screen in the first 5 s, against 2 s needed. Close either way."]);
  });
});
