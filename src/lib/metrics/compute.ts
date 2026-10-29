import { FPS, type Detection, type Mention, type Segment, type VideoInfo, type VideoMetrics } from "@/lib/types";

/**
 * Gaps of up to this many missing frames inside a run are bridged into one segment.
 * SAM drops single frames on motion blur or a quick hand pass; at 15 fps two frames is 0.13 s,
 * shorter than a viewer would notice the product leaving the screen.
 */
export const MAX_GAP_FRAMES = 2;

/** Average mask area at which the area part of the prominence score saturates. */
export const AREA_SATURATION = 0.15;

/** Prominence weights; they sum to 1 so the score stays in 0..100. */
export const PROMINENCE_WEIGHTS = { share: 0.4, area: 0.3, centre: 0.2, earliness: 0.1 };

/** What the metrics need from one on-screen frame, after merging all verified objects in it. */
export interface FrameSample {
  frame: number;
  /** Sum of the objects' mask areas, capped at 1 (masks of separate objects rarely overlap). */
  areaFraction: number;
  /** Centroid of the largest object in the frame. */
  centroid: { x: number; y: number };
}

/**
 * One sample per frame that has at least one detection with a non-empty mask, sorted by frame.
 * Out-of-range frames and zero-area (empty-mask) detections are dropped: they are not on screen.
 */
export function frameSamples(detections: Detection[], info: VideoInfo): FrameSample[] {
  const byFrame = new Map<number, { area: number; largest: Detection }>();
  for (const d of detections) {
    if (!Number.isInteger(d.frame) || d.frame < 0 || d.frame >= info.frameCount) continue;
    const area = clamp01(d.areaFraction);
    if (area <= 0) continue;
    const seen = byFrame.get(d.frame);
    if (!seen) byFrame.set(d.frame, { area, largest: d });
    else {
      seen.area += area;
      if (area > clamp01(seen.largest.areaFraction)) seen.largest = d;
    }
  }
  return [...byFrame.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([frame, { area, largest }]) => ({ frame, areaFraction: Math.min(1, area), centroid: largest.centroid }));
}

/** Merge sorted frame indices into segments, bridging gaps of <= maxGap missing frames. */
export function framesToSegments(frames: number[], maxGap = MAX_GAP_FRAMES): Segment[] {
  const segments: Segment[] = [];
  let start = -1;
  let last = -1;
  for (const f of frames) {
    if (start < 0) {
      start = last = f;
    } else if (f - last - 1 <= maxGap) {
      last = f;
    } else {
      segments.push(frameSegment(start, last));
      start = last = f;
    }
  }
  if (start >= 0) segments.push(frameSegment(start, last));
  return segments;
}

/** 1 at the frame centre, falling linearly to 0 at distance 0.5 (the middle of each edge) and beyond. */
export function centreWeight(c: { x: number; y: number }): number {
  const distance = Math.hypot(c.x - 0.5, c.y - 0.5);
  if (!Number.isFinite(distance)) return 0; // a bad centroid must not turn centerWeightedSec into NaN
  return 1 - Math.min(1, distance / 0.5);
}

/**
 * 0..100, a weighted sum of four parts that each lie in 0..1 and only ever rise with their input:
 * share of video, average area (saturating at AREA_SATURATION), centre ratio (centre-weighted seconds
 * over seconds on screen) and earliness (1 at the first frame, 0 at the end or never seen).
 */
export function prominenceScore(p: { share: number; avgArea: number; centreRatio: number; earliness: number }): number {
  const w = PROMINENCE_WEIGHTS;
  const score =
    w.share * clamp01(p.share) +
    w.area * clamp01(p.avgArea / AREA_SATURATION) +
    w.centre * clamp01(p.centreRatio) +
    w.earliness * clamp01(p.earliness);
  return Math.round(score * sizeFactor(p.avgArea) * 1000) / 10;
}

/** Below this average share of the frame a product is small, however long it is on screen. */
export const SMALL_AREA = 0.03;

/**
 * 1 for a product at least SMALL_AREA of the frame, falling with the square root below it: a can the size of a
 * thumbnail on screen the whole time is not "clearly featured" (round-5 judge: 0.5% of the frame scored 62).
 */
export function sizeFactor(avgArea: number): number {
  return Math.sqrt(clamp01(avgArea / SMALL_AREA));
}

/**
 * Metrics for one video. `detections` must hold only objects verified as a match.
 * secondsOnScreen counts detected frames only (listed in visibleFrames); segments (and longestRunSec) include bridged gaps.
 */
export function computeMetrics(detections: Detection[], info: VideoInfo, mentions: Mention[]): VideoMetrics {
  const samples = frameSamples(detections, info);
  const segments = framesToSegments(samples.map((s) => s.frame));
  const sortedMentions = [...mentions].sort((a, b) => a.startSec - b.startSec);
  const seconds = samples.length / FPS;
  const share = info.durationSec > 0 ? Math.min(1, seconds / info.durationSec) : 0;
  const firstSeenSec = samples.length ? samples[0].frame / FPS : null;
  const avgAreaFraction = samples.length ? sum(samples.map((s) => s.areaFraction)) / samples.length : 0;
  const centerWeightedSec = sum(samples.map((s) => centreWeight(s.centroid))) / FPS;
  const earliness =
    firstSeenSec === null || info.durationSec <= 0 ? 0 : 1 - Math.min(1, firstSeenSec / info.durationSec);

  return {
    secondsOnScreen: seconds,
    shareOfVideo: share,
    firstSeenSec,
    longestRunSec: Math.max(0, ...segments.map((s) => s.endSec - s.startSec)),
    avgAreaFraction,
    centerWeightedSec,
    prominenceScore: samples.length
      ? prominenceScore({ share, avgArea: avgAreaFraction, centreRatio: centerWeightedSec / seconds, earliness })
      : 0,
    prominenceSized: true,
    segments,
    mentions: sortedMentions,
    visibleFrames: samples.map((s) => s.frame),
  };
}

function frameSegment(first: number, last: number): Segment {
  return { startSec: first / FPS, endSec: (last + 1) / FPS };
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
