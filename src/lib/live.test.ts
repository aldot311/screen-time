import { describe, expect, it } from "vitest";
import { liveFromReport, liveUpTo } from "./live";
import type { VideoReport } from "./types";

const report = (over: Partial<VideoReport> = {}): VideoReport =>
  ({
    videoId: "v",
    info: { width: 540, height: 960, frameCount: 16, durationSec: 16 / 15 },
    prompt: "drink can",
    tracks: [{ objectId: 0, verdict: "match", visibility: "clear", reason: "teal can" }],
    metrics: { secondsOnScreen: 1, shareOfVideo: 0.9, firstSeenSec: 0, longestRunSec: 1, segments: [], mentions: [] },
    terms: [],
    cost: { samFrames: 16, usd: 0.05 },
    detections: Array.from({ length: 16 }, (_, f) => ({ frame: f, objectId: 0, box: { x1: 1, y1: 1, x2: 9, y2: 9 }, areaFraction: 0.1, centroid: { x: 0.5, y: 0.5 }, verdict: "match" as const })),
    ...over,
  }) as VideoReport;

describe("liveFromReport", () => {
  it("leaves the verdict off the filmstrip boxes, so a replay colors them only once Muse Spark's step is shown", () => {
    const live = liveFromReport(report());
    expect(live.searches?.[0].boxes.length).toBeGreaterThan(0);
    expect(live.searches?.[0].boxes.every((b) => !("verdict" in b))).toBe(true);
    expect(liveUpTo(live, 1).checks).toBeUndefined();
    expect(liveUpTo(live, 2).checks?.[0].verdict).toBe("match");
  });

  it("does not claim no disclosure was said when the report never checked for one", () => {
    expect(liveFromReport(report()).heard).toEqual({ mentions: [] });
    const checked = liveFromReport(report({ disclosure: { spoken: [{ startSec: 1, endSec: 1.2, text: "ad" }], onScreen: [] } }));
    expect(checked.heard?.disclosures).toHaveLength(1);
  });
});
