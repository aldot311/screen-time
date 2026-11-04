import { describe, expect, it } from "vitest";
import type { TermResult, VideoReport } from "@/lib/types";
import { reviewFlags, reviewReason } from "./review";

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
    expect(flags).toEqual([
      "Muse Spark saw the product blurred, so a frame or two may be missing.",
      "Muse Spark could not tell what one tracked object is, so it was not counted.",
    ]);
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

  it("measures 'within the first' from the frames actually seen, like the contract checker, not bridged segments", () => {
    // Every other frame for five seconds: segments would say 5 s, the frames say about 2.5 s, near a 3 s threshold.
    const visibleFrames = Array.from({ length: 38 }, (_, i) => i * 2);
    const flags = reviewFlags(
      report({
        metrics: { visibleFrames, segments: [{ startSec: 0, endSec: 5 }] },
        terms: [term("3 s in the first 5", { kind: "min_seconds_within", seconds: 3, withinFirstSec: 5 }, false)],
      }),
    );
    expect(flags).toEqual(["“3 s in the first 5”: 2.5 s on screen in the first 5 s, against 3 s needed. Close either way."]);
  });

  it("does not crash on a report without tracks", () => {
    expect(reviewFlags({ terms: [] } as unknown as VideoReport)).toEqual([]);
  });
});

describe("a spoken mention near its window's end", () => {
  const within5 = (pass: boolean) => term("Say LaCroix in the first 5 s", { kind: "mentioned", minTimes: 1, withinFirstSec: 5 }, pass);
  const said = (...starts: number[]) => starts.map((s) => ({ startSec: s, endSec: s + 0.26, text: "LaCroix" }));

  it("flags a mention estimated just past the window, and one just inside it", () => {
    // Michael K's "LaCroix" is estimated at 5.28 s from its place in the speech turn: against a 5 s window, too close to call.
    expect(reviewFlags(report({ metrics: { mentions: said(5.278823529411765) }, terms: [within5(false)] }))).toEqual([
      "“Say LaCroix in the first 5 s”: first said at ≈0:05, against the first 5 s. Close either way.",
    ]);
    expect(reviewFlags(report({ metrics: { mentions: said(4.7) }, terms: [within5(true)] }))).toHaveLength(1);
  });

  it("leaves a mention well inside the window alone, and a term with no window", () => {
    expect(reviewFlags(report({ metrics: { mentions: said(2) }, terms: [within5(true)] }))).toEqual([]);
    expect(reviewFlags(report({ metrics: { mentions: said(5.1) }, terms: [term("Say it", { kind: "mentioned", minTimes: 1 })] }))).toEqual([]);
  });

  it("measures the mention that decides: the second one for 'at least twice'", () => {
    const twice = term("Say LaCroix twice in the first 10 s", { kind: "mentioned", minTimes: 2, withinFirstSec: 10 });
    expect(reviewFlags(report({ metrics: { mentions: said(10.3, 1) }, terms: [twice] }))).toEqual([
      "“Say LaCroix twice in the first 10 s”: said a 2nd time at ≈0:10, against the first 10 s. Close either way.",
    ]);
    expect(reviewFlags(report({ metrics: { mentions: said(1) }, terms: [twice] }))).toEqual([]);
  });
});

describe("a disclosure met only by on-screen text that does not say it is an ad", () => {
  // Michael K's stored report (6-michael-captioned-gk3bzd): Muse Spark read "AN AD" on screen at 9.27 s, nothing was
  // heard as a disclosure, and the product was seen blurred.
  const michaelK = report({
    metrics: {
      secondsOnScreen: 14.533333333333333,
      firstSeenSec: 0,
      longestRunSec: 14.533333333333333,
      segments: [{ startSec: 0, endSec: 14.533333333333333 }],
      mentions: [{ startSec: 5.278823529411765, endSec: 5.53764705882353, text: "LaCroix" }],
    },
    tracks: [{ objectId: 0, verdict: "match", visibility: "blurred", reason: "" }],
    terms: [
      { term: { text: "On screen at least 3 seconds in total", rule: { kind: "min_seconds_total", seconds: 3 } }, pass: true, evidence: [{ startSec: 0, endSec: 14.533333333333333 }], detail: "On screen 14.5 s in total (needs 3 s)." },
      { term: { text: "Says LaCroix out loud", rule: { kind: "mentioned", minTimes: 1 } }, pass: true, evidence: [{ startSec: 5.278823529411765, endSec: 5.53764705882353 }], detail: "Mentioned 1 time (needs 1 time)." },
      {
        term: { text: "Discloses the ad: says it is an ad or sponsored", rule: { kind: "disclosed" } },
        pass: true,
        evidence: [{ startSec: 9.266666666666667, endSec: 9.333333333333334 }],
        detail: "Disclosed: shown on screen “AN AD” at 0:09.2",
      },
    ],
    disclosure: { spoken: [], onScreen: [{ startSec: 9.266666666666667, text: "AN AD" }], onScreenChecked: true },
  });
  const disclose = term("Discloses the ad", { kind: "disclosed" });
  const withDisclosure = (disclosure: VideoReport["disclosure"], pass: boolean | null = true) => report({ terms: [term("Discloses the ad", { kind: "disclosed" }, pass)], disclosure });

  it("flags Michael K's report first, ahead of the blur, and the card says why in two words", () => {
    expect(reviewFlags(michaelK)).toEqual([
      "“Discloses the ad: says it is an ad or sponsored”: the only disclosure is the on-screen text “AN AD”, and none was heard said aloud. Implied, not stated: worth a look.",
      "Muse Spark saw the product blurred, so a frame or two may be missing.",
    ]);
    expect(reviewReason(michaelK)).toBe("implied disclosure");
  });

  it("does not flag a disclosure that is said aloud, or on-screen text that says it by itself", () => {
    // The control: "this is an ad" on screen and said aloud.
    const said = [{ startSec: 10.8, endSec: 11.8, text: "this is an ad" }];
    expect(reviewFlags(withDisclosure({ spoken: said, onScreen: [{ startSec: 11, text: "this is an ad" }] }))).toEqual([]);
    // Said aloud, with the fragment on screen: the spoken check settles it.
    expect(reviewFlags(withDisclosure({ spoken: said, onScreen: [{ startSec: 11, text: "AN AD" }] }))).toEqual([]);
    // On screen only, as a full sentence or a one-word label.
    for (const text of ["THIS IS AN AD", "#ad", "Sponsored", "#ad #lacroix", "Paid partnership"])
      expect(reviewFlags(withDisclosure({ spoken: [], onScreen: [{ startSec: 1, text }] })), text).toEqual([]);
  });

  it("flags a denial read on screen, and leaves a term that was not met to its verdict", () => {
    expect(reviewFlags(withDisclosure({ spoken: [], onScreen: [{ startSec: 2, text: "NOT AN AD" }] }))).toHaveLength(1);
    expect(reviewFlags(withDisclosure({ spoken: [], onScreen: [{ startSec: 2, text: "AN AD" }] }, false))).toEqual([]);
    expect(reviewFlags(report({ terms: [disclose] }))).toEqual([]);
  });
});
