import { describe, expect, it } from "vitest";
import type { ContractRule, VideoMetrics } from "@/lib/types";
import { checkTerm, checkTerms, clipSegments } from "./rules";
import type { FrameSample } from "./compute";

function metrics(over: Partial<VideoMetrics> = {}): VideoMetrics {
  return {
    secondsOnScreen: 0,
    shareOfVideo: 0,
    firstSeenSec: null,
    longestRunSec: 0,
    avgAreaFraction: 0,
    centerWeightedSec: 0,
    prominenceScore: 0,
    segments: [],
    mentions: [],
    ...over,
  };
}

const term = (rule: ContractRule | null) => ({ text: "contract wording", rule });

// On screen 1.0–3.0 s and 8.0–9.4 s.
const seen = metrics({
  secondsOnScreen: 3.4,
  firstSeenSec: 1,
  longestRunSec: 2,
  segments: [
    { startSec: 1, endSec: 3 },
    { startSec: 8, endSec: 9.4 },
  ],
  mentions: [
    { startSec: 2, endSec: 2.5, text: "Nike" },
    { startSec: 12, endSec: 12.4, text: "nike" },
  ],
});

describe("checkTerm", () => {
  it("returns not checkable for a null rule", () => {
    const r = checkTerm(term(null), seen);
    expect(r.pass).toBeNull();
    expect(r.evidence).toEqual([]);
    expect(r.term.text).toBe("contract wording");
  });

  describe("min_seconds_total", () => {
    it("passes at exactly the threshold", () => {
      const r = checkTerm(term({ kind: "min_seconds_total", seconds: 3.4 }), seen);
      expect(r.pass).toBe(true);
      expect(r.evidence).toEqual(seen.segments);
    });

    it("tolerates float sums just under a whole number", () => {
      const m = metrics({ secondsOnScreen: 45 * (1 / 15) });
      expect(checkTerm(term({ kind: "min_seconds_total", seconds: 3 }), m).pass).toBe(true);
    });

    it("fails and never shows a near miss as the threshold", () => {
      const r = checkTerm(term({ kind: "min_seconds_total", seconds: 3 }), metrics({ secondsOnScreen: 2.96 }));
      expect(r.pass).toBe(false);
      expect(r.detail).toBe("On screen 2.9 s in total (needs 3 s).");
    });

    it("fails on an empty video", () => {
      expect(checkTerm(term({ kind: "min_seconds_total", seconds: 1 }), metrics()).pass).toBe(false);
    });
  });

  describe("min_seconds_within", () => {
    it("counts only the part inside the window", () => {
      const r = checkTerm(term({ kind: "min_seconds_within", seconds: 3, withinFirstSec: 8.5 }), seen);
      expect(r.pass).toBe(false);
      expect(r.evidence).toEqual([
        { startSec: 1, endSec: 3 },
        { startSec: 8, endSec: 8.5 },
      ]);
      expect(r.detail).toBe("On screen at most 2.5 s in the first 8.5 s (needs 3 s)."); // no frames: upper bound
    });

    it("passes when enough falls inside (with frame data), not checkable without it", () => {
      const rule = term({ kind: "min_seconds_within", seconds: 2, withinFirstSec: 3 });
      const frames: FrameSample[] = Array.from({ length: 30 }, (_, i) => ({
        frame: 15 + i,
        areaFraction: 0.1,
        centroid: { x: 0.5, y: 0.5 },
      }));
      expect(checkTerm(rule, seen, frames).pass).toBe(true);
      expect(checkTerm(rule, seen).pass).toBeNull();
    });

    it("excludes a segment starting exactly at the window end", () => {
      const r = checkTerm(term({ kind: "min_seconds_within", seconds: 0.1, withinFirstSec: 1 }), seen);
      expect(r.pass).toBe(false);
      expect(r.evidence).toEqual([{ startSec: 1, endSec: 3 }]); // closest miss
      expect(r.detail).toBe("On screen at most 0 s in the first 1 s (needs 0.1 s).");
    });

    it("has no evidence when never seen", () => {
      const r = checkTerm(term({ kind: "min_seconds_within", seconds: 1, withinFirstSec: 5 }), metrics());
      expect(r).toMatchObject({ pass: false, evidence: [] });
    });
  });

  describe("min_continuous", () => {
    it("points at the longest run", () => {
      const r = checkTerm(term({ kind: "min_continuous", seconds: 2 }), seen);
      expect(r.pass).toBe(true);
      expect(r.evidence).toEqual([{ startSec: 1, endSec: 3 }]);
      expect(r.detail).toBe("Longest continuous run 2 s (needs 2 s).");
    });

    it("fails when the longest run is short", () => {
      expect(checkTerm(term({ kind: "min_continuous", seconds: 2.5 }), seen).pass).toBe(false);
    });
  });

  describe("min_area", () => {
    const frames: FrameSample[] = [
      ...Array.from({ length: 20 }, (_, i) => ({ frame: i, areaFraction: 0.12, centroid: { x: 0.5, y: 0.5 } })),
      ...Array.from({ length: 30 }, (_, i) => ({ frame: 40 + i, areaFraction: 0.05, centroid: { x: 0.5, y: 0.5 } })),
    ];

    it("is not checkable without per-frame data", () => {
      expect(checkTerm(term({ kind: "min_area", fraction: 0.1, forSeconds: 1 }), seen).pass).toBeNull();
    });

    it("counts seconds at or above the size", () => {
      const r = checkTerm(term({ kind: "min_area", fraction: 0.12, forSeconds: 1 }), seen, frames);
      expect(r.pass).toBe(true);
      expect(r.evidence).toEqual([{ startSec: 0, endSec: 20 / 15 }]);
      expect(r.detail).toBe("At least 12% of the frame for 1.3 s (needs 1 s).");
    });

    it("fails and points at the largest frame when never big enough", () => {
      const r = checkTerm(term({ kind: "min_area", fraction: 0.5, forSeconds: 1 }), seen, frames);
      expect(r.pass).toBe(false);
      expect(r.evidence).toEqual([{ startSec: 0, endSec: 1 / 15 }]);
    });
  });

  describe("mentioned", () => {
    it("counts all mentions without a window", () => {
      const r = checkTerm(term({ kind: "mentioned", minTimes: 2 }), seen);
      expect(r.pass).toBe(true);
      expect(r.evidence).toEqual([
        { startSec: 2, endSec: 2.5 },
        { startSec: 12, endSec: 12.4 },
      ]);
      expect(r.detail).toBe("Mentioned 2 times (needs 2 times).");
    });

    it("counts only mentions starting inside the window", () => {
      const r = checkTerm(term({ kind: "mentioned", minTimes: 2, withinFirstSec: 12 }), seen);
      expect(r.pass).toBe(false);
      expect(r.detail).toBe("Mentioned 1 time in the first 12 s (needs 2 times).");
    });

    it("shows the first later mention as the closest miss", () => {
      const m = metrics({ mentions: [{ startSec: 20, endSec: 21, text: "Nike" }] });
      const r = checkTerm(term({ kind: "mentioned", minTimes: 1, withinFirstSec: 10 }), m);
      expect(r.pass).toBe(false);
      expect(r.evidence).toEqual([{ startSec: 20, endSec: 21 }]);
    });

    it("passes a zero requirement with no mentions", () => {
      expect(checkTerm(term({ kind: "mentioned", minTimes: 0 }), metrics()).pass).toBe(true);
    });
  });

  describe("first_seen_before", () => {
    it("passes when seen strictly before", () => {
      const r = checkTerm(term({ kind: "first_seen_before", seconds: 2 }), seen);
      expect(r.pass).toBe(true);
      expect(r.evidence).toEqual([{ startSec: 1, endSec: 3 }]);
      expect(r.detail).toBe("First seen at 1 s (needs to appear before 2 s).");
    });

    it("fails when first seen exactly at the boundary", () => {
      expect(checkTerm(term({ kind: "first_seen_before", seconds: 1 }), seen).pass).toBe(false);
    });

    it("fails when never seen", () => {
      const r = checkTerm(term({ kind: "first_seen_before", seconds: 3 }), metrics());
      expect(r.pass).toBe(false);
      expect(r.detail).toBe("Never seen (needs to appear before 3 s).");
    });
  });
});

describe("checkTerms", () => {
  it("checks each term in order", () => {
    const rs = checkTerms([term(null), term({ kind: "min_continuous", seconds: 1 })], seen);
    expect(rs.map((r) => r.pass)).toEqual([null, true]);
  });
});

describe("clipSegments", () => {
  it("clips and drops segments outside the window", () => {
    expect(
      clipSegments(
        [
          { startSec: 0, endSec: 2 },
          { startSec: 4, endSec: 6 },
        ],
        5,
      ),
    ).toEqual([
      { startSec: 0, endSec: 2 },
      { startSec: 4, endSec: 5 },
    ]);
  });
});

describe("review fixes", () => {
  // Frames 0 and 3 detected: 2 frames on screen, but the bridged segment spans 4 frames.
  const bridged = metrics({
    secondsOnScreen: 2 / 15,
    firstSeenSec: 0,
    longestRunSec: 4 / 15,
    segments: [{ startSec: 0, endSec: 4 / 15 }],
  });
  const samples: FrameSample[] = [0, 3].map((frame) => ({ frame, areaFraction: 0.1, centroid: { x: 0.5, y: 0.5 } }));

  it("never counts more seconds within a window than on screen in total", () => {
    const within = checkTerm(term({ kind: "min_seconds_within", seconds: 0.25, withinFirstSec: 10 }), bridged);
    const total = checkTerm(term({ kind: "min_seconds_total", seconds: 0.25 }), bridged);
    expect(total.pass).toBe(false);
    expect(within.pass).toBe(false);
  });

  it("counts detected frames in the window when frame samples are given", () => {
    const r = checkTerm(term({ kind: "min_seconds_within", seconds: 0.1, withinFirstSec: 0.1 }), bridged, samples);
    expect(r.pass).toBe(false); // only frame 0 (1/15 s) is before 0.1 s
    expect(checkTerm(term({ kind: "min_seconds_within", seconds: 2 / 15, withinFirstSec: 1 }), bridged, samples).pass).toBe(true);
  });

  it("shows contract thresholds as written, not rounded down", () => {
    const r = checkTerm(term({ kind: "min_seconds_total", seconds: 0.25 }), bridged);
    expect(r.detail).toBe("On screen 0.1 s in total (needs 0.25 s).");
  });
});

describe("external review fixes", () => {
  const sample = (frame: number): FrameSample => ({ frame, areaFraction: 0.1, centroid: { x: 0.5, y: 0.5 } });

  it("counts only the part of a frame that overlaps the window end", () => {
    // Frames 0 and 1 cover 0..2/15 s; a 0.1 s window holds 1/15 s of frame 0 and 1/30 s of frame 1.
    const m = metrics({ secondsOnScreen: 2 / 15, firstSeenSec: 0, segments: [{ startSec: 0, endSec: 2 / 15 }] });
    const frames = [sample(0), sample(1)];
    expect(checkTerm(term({ kind: "min_seconds_within", seconds: 0.11, withinFirstSec: 0.1 }), m, frames).pass).toBe(false);
    expect(checkTerm(term({ kind: "min_seconds_within", seconds: 0.1, withinFirstSec: 0.1 }), m, frames).pass).toBe(true);
  });

  it("does not use bridged segment time for the window when frames are missing", () => {
    // Detected at frames 0,3 and 30..33: segments bridge 0..4/15, but only 2/15 s is detected in the first second.
    const m = metrics({
      secondsOnScreen: 6 / 15,
      firstSeenSec: 0,
      longestRunSec: 4 / 15,
      segments: [
        { startSec: 0, endSec: 4 / 15 },
        { startSec: 2, endSec: 34 / 15 },
      ],
    });
    const rule = term({ kind: "min_seconds_within", seconds: 0.2, withinFirstSec: 1 });
    const r = checkTerm(rule, m);
    expect(r.pass).toBeNull();
    expect(r.detail).toMatch(/per-frame/);
    const frames = [0, 3, 30, 31, 32, 33].map(sample);
    expect(checkTerm(rule, m, frames).pass).toBe(false);
  });
});
