import { describe, expect, it } from "vitest";
import { computeMetrics } from "@/lib/metrics/compute";
import { FPS, type Detection, type TermResult } from "@/lib/types";
import { settlesAt } from "./live-replay";

const DURATION = 10;
const info = { width: 540, height: 960, frameCount: DURATION * FPS, durationSec: DURATION };
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const metricsOf = (frames: number[]) =>
  computeMetrics(
    frames.map((frame): Detection => ({ frame, objectId: 0, box: { x1: 0, y1: 0, x2: 99, y2: 99 }, areaFraction: 0.1, centroid: { x: 0.5, y: 0.5 } })),
    info,
    [],
  );
const shot = (seconds: number): TermResult => ({ term: { text: `${seconds} s in one shot`, rule: { kind: "min_continuous", seconds } }, pass: true, evidence: [], detail: "" });

describe("settlesAt: one unbroken shot", () => {
  it("bridges a gap of two missing frames, as the metrics do, and settles when the run reaches the threshold", () => {
    // Frames 20 and 21 are missing: the metrics bridge them into one 50-frame run (3.3 s), so a 3 s shot is met.
    const m = metricsOf([...range(0, 19), ...range(22, 49)]);
    expect(m.longestRunSec).toBeCloseTo(50 / FPS);
    expect(settlesAt(shot(3), m, DURATION)).toBeCloseTo(45 / FPS);
  });

  it("starts a new run after a gap of three frames", () => {
    const m = metricsOf([...range(0, 19), ...range(23, 70)]);
    // The second run, from frame 23, reaches 45 frames at the end of frame 67.
    expect(settlesAt(shot(3), m, DURATION)).toBeCloseTo(68 / FPS);
  });

  it("settles before the end exactly when the metrics' longest run meets the term", () => {
    const patterns = [
      range(0, 44),
      range(0, 43),
      [...range(0, 10), ...range(13, 30), ...range(33, 44)],
      [...range(0, 10), ...range(14, 50)],
      range(0, 149).filter((f) => f % 3 !== 0),
      range(0, 149).filter((f) => f % 4 === 0),
    ];
    for (const frames of patterns) {
      const m = metricsOf(frames);
      const met = m.longestRunSec + 1e-6 >= 3;
      expect(settlesAt(shot(3), m, DURATION) < DURATION - 0.2, `frames ${frames[0]}..${frames.at(-1)}`).toBe(met);
    }
  });
});
