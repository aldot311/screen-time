import { describe, expect, it } from "vitest";
import { FPS, type Detection, type VideoInfo } from "@/lib/types";
import { centreWeight, computeMetrics, frameSamples, framesToSegments, prominenceScore } from "./compute";

const info = (frameCount: number): VideoInfo => ({ width: 1080, height: 1920, frameCount, durationSec: frameCount / FPS });

function det(frame: number, over: Partial<Detection> = {}): Detection {
  return {
    frame,
    objectId: 1,
    box: { x1: 0, y1: 0, x2: 10, y2: 10 },
    areaFraction: 0.1,
    centroid: { x: 0.5, y: 0.5 },
    ...over,
  };
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

describe("framesToSegments", () => {
  it("returns nothing for no frames", () => {
    expect(framesToSegments([])).toEqual([]);
  });

  it("makes a single frame a one-frame segment with exclusive end", () => {
    expect(framesToSegments([15])).toEqual([{ startSec: 1, endSec: 16 / 15 }]);
  });

  it("bridges gaps of 1 and 2 missing frames", () => {
    expect(framesToSegments([0, 1, 3, 4, 7, 8])).toEqual([{ startSec: 0, endSec: 9 / 15 }]);
  });

  it("splits on a gap of 3 missing frames", () => {
    expect(framesToSegments([0, 1, 5, 6])).toEqual([
      { startSec: 0, endSec: 2 / 15 },
      { startSec: 5 / 15, endSec: 7 / 15 },
    ]);
  });
});

describe("centreWeight", () => {
  it("is 1 at the centre, 0 at an edge midpoint and corners", () => {
    expect(centreWeight({ x: 0.5, y: 0.5 })).toBe(1);
    expect(centreWeight({ x: 0, y: 0.5 })).toBe(0);
    expect(centreWeight({ x: 0, y: 0 })).toBe(0);
    expect(centreWeight({ x: 0.75, y: 0.5 })).toBeCloseTo(0.5);
  });
});

describe("prominenceScore", () => {
  const base = { share: 0.3, avgArea: 0.05, centreRatio: 0.5, earliness: 0.5 };

  it("is 0 for nothing and 100 for everything maxed", () => {
    expect(prominenceScore({ share: 0, avgArea: 0, centreRatio: 0, earliness: 0 })).toBe(0);
    expect(prominenceScore({ share: 1, avgArea: 0.15, centreRatio: 1, earliness: 1 })).toBe(100);
  });

  it("saturates area at 15% of the frame", () => {
    expect(prominenceScore({ ...base, avgArea: 0.15 })).toBe(prominenceScore({ ...base, avgArea: 0.9 }));
  });

  it("rises with each input on its own", () => {
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
      expect(prominenceScore({ ...base, [key]: base[key] * 1.5 })).toBeGreaterThan(prominenceScore(base));
    }
  });
});

describe("frameSamples", () => {
  it("merges objects in one frame: summed area, centroid of the largest", () => {
    const s = frameSamples(
      [
        det(3, { objectId: 1, areaFraction: 0.1, centroid: { x: 0.1, y: 0.1 } }),
        det(3, { objectId: 2, areaFraction: 0.3, centroid: { x: 0.6, y: 0.6 } }),
      ],
      info(10),
    );
    expect(s).toHaveLength(1);
    expect(s[0].areaFraction).toBeCloseTo(0.4);
    expect(s[0].centroid).toEqual({ x: 0.6, y: 0.6 });
  });

  it("caps summed area at 1 and drops out-of-range frames", () => {
    const s = frameSamples([det(0, { areaFraction: 0.7 }), det(0, { objectId: 2, areaFraction: 0.7 }), det(10), det(-1)], info(10));
    expect(s.map((x) => x.frame)).toEqual([0]);
    expect(s[0].areaFraction).toBe(1);
  });
});

describe("computeMetrics", () => {
  it("handles an empty video", () => {
    const m = computeMetrics([], { width: 0, height: 0, frameCount: 0, durationSec: 0 }, []);
    expect(m).toEqual({
      secondsOnScreen: 0,
      shareOfVideo: 0,
      firstSeenSec: null,
      longestRunSec: 0,
      avgAreaFraction: 0,
      centerWeightedSec: 0,
      prominenceScore: 0,
      segments: [],
      mentions: [],
    });
  });

  it("handles a video with no detections", () => {
    const m = computeMetrics([], info(150), []);
    expect(m.secondsOnScreen).toBe(0);
    expect(m.firstSeenSec).toBeNull();
    expect(m.prominenceScore).toBe(0);
  });

  it("covers every frame of the video", () => {
    const m = computeMetrics(range(0, 150).map((f) => det(f, { areaFraction: 0.2 })), info(150), []);
    expect(m.secondsOnScreen).toBe(10);
    expect(m.shareOfVideo).toBe(1);
    expect(m.firstSeenSec).toBe(0);
    expect(m.longestRunSec).toBe(10);
    expect(m.segments).toEqual([{ startSec: 0, endSec: 10 }]);
    expect(m.avgAreaFraction).toBeCloseTo(0.2);
    expect(m.centerWeightedSec).toBe(10);
    expect(m.prominenceScore).toBe(100);
  });

  it("counts detected frames but bridges blur gaps in segments", () => {
    // frames 0..29 with 15 and 16 dropped (blur), then a separate run 60..74
    const frames = [...range(0, 30).filter((f) => f !== 15 && f !== 16), ...range(60, 75)];
    const m = computeMetrics(frames.map((f) => det(f)), info(150), []);
    expect(m.secondsOnScreen).toBeCloseTo(43 / 15);
    expect(m.segments).toEqual([
      { startSec: 0, endSec: 2 },
      { startSec: 4, endSec: 5 },
    ]);
    expect(m.longestRunSec).toBe(2);
    expect(m.firstSeenSec).toBe(0);
  });

  it("reports first-seen time and centre weighting from the largest object", () => {
    const m = computeMetrics(
      range(45, 60).map((f) => det(f, { centroid: { x: 0.75, y: 0.5 } })),
      info(150),
      [],
    );
    expect(m.firstSeenSec).toBe(3);
    expect(m.centerWeightedSec).toBeCloseTo(0.5);
    expect(m.shareOfVideo).toBeCloseTo(0.1);
  });

  it("counts a frame once when several verified objects are in it", () => {
    const m = computeMetrics([det(0), det(0, { objectId: 2 })], info(15), []);
    expect(m.secondsOnScreen).toBeCloseTo(1 / 15);
  });

  it("sorts mentions by time", () => {
    const m = computeMetrics([], info(150), [
      { startSec: 5, endSec: 6, text: "b" },
      { startSec: 1, endSec: 2, text: "a" },
    ]);
    expect(m.mentions.map((x) => x.text)).toEqual(["a", "b"]);
  });

  it("scores a big centred early product above a small edge late one", () => {
    const big = computeMetrics(range(0, 30).map((f) => det(f, { areaFraction: 0.2 })), info(150), []);
    const small = computeMetrics(
      range(120, 150).map((f) => det(f, { areaFraction: 0.02, centroid: { x: 0.95, y: 0.5 } })),
      info(150),
      [],
    );
    expect(big.prominenceScore).toBeGreaterThan(small.prominenceScore);
    expect(small.prominenceScore).toBeGreaterThan(0);
  });
});

describe("bad centroids", () => {
  it("gives a non-finite centroid zero centre weight instead of NaN", () => {
    expect(centreWeight({ x: NaN, y: 0.5 })).toBe(0);
    const m = computeMetrics([det(0, { centroid: { x: NaN, y: NaN } })], info(15), []);
    expect(m.centerWeightedSec).toBe(0);
    expect(Number.isFinite(m.prominenceScore)).toBe(true);
  });
});

describe("zero-area detections", () => {
  it("does not make a frame visible when the mask is empty", () => {
    const m = computeMetrics([det(0, { areaFraction: 0 }), det(1, { areaFraction: -0.1 }), det(2)], info(30), []);
    expect(m.secondsOnScreen).toBeCloseTo(1 / 15);
    expect(m.firstSeenSec).toBeCloseTo(2 / 15);
    expect(frameSamples([det(5, { areaFraction: 0 })], info(30))).toEqual([]);
  });
});
