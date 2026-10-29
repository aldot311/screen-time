import { describe, expect, it } from "vitest";
import { friendlyError, countedBefore, verdictOf } from "./format";

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
