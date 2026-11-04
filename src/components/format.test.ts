import { describe, expect, it } from "vitest";
import type { Disclosure, TermResult } from "@/lib/types";
import { friendlyError, countedBefore, disclosureLine, shownBy, spokenTime, spokenWindow, termDetail, verdictOf } from "./format";

describe("friendlyError", () => {
  it("turns API failures into what happened and who acts", () => {
    expect(friendlyError("Meta API: the account has no credits yet (402). Nothing was charged.")).toMatch(/Aetrai needs to add credits/);
    expect(friendlyError("The Meta API key is not configured")).toMatch(/key is missing/);
    expect(friendlyError("Spend of $0.0300 would exceed the per-run cap of $0.01")).toMatch(/spending limit/);
    expect(friendlyError("HTTP 503 backend_unavailable")).toMatch(/temporary problem/);
  });

  it("passes unknown errors through unchanged and keeps undefined", () => {
    expect(friendlyError("ffmpeg could not read the file")).toBe("ffmpeg could not read the file");
    expect(friendlyError(undefined)).toBeUndefined();
  });
});

describe("verdictOf", () => {
  it("needs every term met for delivered, and any miss is short", () => {
    const term = (pass: boolean | null) => ({ term: { text: "t", rule: null }, pass, evidence: [], detail: "" });
    const r = (passes: (boolean | null)[]) => ({ terms: passes.map(term) }) as never;
    expect(verdictOf(undefined)).toBe("pending");
    expect(verdictOf(r([true, true]))).toBe("delivered");
    expect(verdictOf(r([true, false, null]))).toBe("short");
    expect(verdictOf(r([true, null]))).toBe("review");
    expect(verdictOf(r([]))).toBe("review");
  });
});

describe("countedBefore", () => {
  const base = { secondsOnScreen: 0, centerWeightedSec: 0, shareOfVideo: 0, firstSeenSec: null, longestRunSec: 0, avgAreaFraction: 0, prominenceScore: 0, mentions: [] };

  it("counts detected frames that have played, not bridged gaps", () => {
    // Frames 0 and 3 are bridged into one 4-frame segment, but only 2 frames were seen.
    const m = { ...base, segments: [{ startSec: 0, endSec: 4 / 15 }], visibleFrames: [0, 3] };
    expect(countedBefore(m, 0)).toBe(0);
    expect(countedBefore(m, 0.1)).toBe(1 / 15);
    expect(countedBefore(m, 10)).toBe(2 / 15);
  });

  it("falls back to segments for reports without visibleFrames", () => {
    const m = { ...base, segments: [{ startSec: 1, endSec: 3 }, { startSec: 5, endSec: 6 }] };
    expect(countedBefore(m, 2)).toBe(1);
    expect(countedBefore(m, 10)).toBe(3);
  });
});

describe("spoken and on-screen times", () => {
  it("prints a spoken time to the whole second, marked as an estimate", () => {
    // Michael K's "LaCroix", estimated at 5.28 s from its place in a speech turn.
    expect(spokenTime(5.278823529411765)).toBe("≈0:05");
    expect(spokenTime(0.27)).toBe("≈0:00");
    expect(spokenTime(59.99)).toBe("≈0:59");
    expect(spokenTime(65.9)).toBe("≈1:05");
  });

  it("prints on-screen text as read by a sampled frame", () => {
    expect(shownBy(9.266666666666667)).toBe("by 0:09");
  });

  it("plays the sentence around a spoken word: 2.5 s before it to 2 s after, inside the video", () => {
    expect(spokenWindow({ startSec: 5.278823529411765, endSec: 5.53764705882353 }, 14.533333333333333)).toEqual({
      startSec: 5.278823529411765 - 2.5,
      endSec: 5.53764705882353 + 2,
    });
    expect(spokenWindow({ startSec: 0.27642857142857147, endSec: 0.8292857142857143 }, 16.5).startSec).toBe(0);
    expect(spokenWindow({ startSec: 23.28, endSec: 24.37333333333333 }, 25).endSec).toBe(25);
  });
});

describe("disclosureLine and termDetail", () => {
  // Michael K's stored report: nothing said, the on-screen text "AN AD" read on the frame at 9.27 s.
  const michaelK: Disclosure = { spoken: [], onScreen: [{ startSec: 9.266666666666667, text: "AN AD" }], onScreenChecked: true };
  const ash: Disclosure = {
    spoken: [{ startSec: 8.605882352941176, endSec: 9.589411764705883, text: "this is an ad" }],
    onScreen: [{ startSec: 9.8, text: "THIS IS AN AD" }],
    onScreenChecked: true,
  };
  const disclosed = (pass: boolean | null, detail: string): TermResult => ({
    term: { text: "Discloses the ad: says it is an ad or sponsored", rule: { kind: "disclosed" } },
    pass,
    evidence: [],
    detail,
  });

  it("names the first spoken and the first on-screen disclosure, with times that do not claim more than they know", () => {
    expect(disclosureLine(michaelK)).toBe("on screen “AN AD” by 0:09");
    expect(disclosureLine(ash)).toBe("said “this is an ad” at ≈0:08; on screen “THIS IS AN AD” by 0:09");
  });

  it("rewords a met disclosure term stored with the older wording, and leaves every other detail as stored", () => {
    expect(termDetail(disclosed(true, "Disclosed: shown on screen “AN AD” at 0:09.2"), michaelK)).toBe("Disclosed: on screen “AN AD” by 0:09");
    const missed = "Not disclosed: no “ad” or “sponsored” said or shown on screen";
    expect(termDetail(disclosed(false, missed), { spoken: [], onScreen: [], onScreenChecked: true })).toBe(missed);
    // An older report without disclosure data keeps what it says.
    expect(termDetail(disclosed(true, "Disclosed: said “ad” at 0:01.2"), undefined)).toBe("Disclosed: said “ad” at 0:01.2");
    const total: TermResult = { term: { text: "3 s", rule: { kind: "min_seconds_total", seconds: 3 } }, pass: true, evidence: [], detail: "On screen 14.5 s in total (needs 3 s)." };
    expect(termDetail(total, michaelK)).toBe("On screen 14.5 s in total (needs 3 s).");
  });
});
