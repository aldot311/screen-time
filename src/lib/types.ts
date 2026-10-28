// Shared contracts between pipeline modules. Times are seconds from the start of the normalized video.

/** Every video is normalized to this frame rate before SAM, so frame index / FPS is exact time. */
export const FPS = 15;

export interface Box {
  x1: number;
  y1: number;
  x2: number; // inclusive, source pixels
  y2: number;
}

/** One object in one frame, as returned by SAM 3.1 and reduced to what the metrics need. */
export interface Detection {
  frame: number;
  objectId: number;
  box: Box;
  /** Mask pixel count / frame pixel count, 0..1. */
  areaFraction: number;
  /** Mask centroid, normalized 0..1 in each axis. */
  centroid: { x: number; y: number };
  confidence?: number;
}

export interface VideoInfo {
  width: number;
  height: number;
  frameCount: number;
  durationSec: number;
}

/** All detections for one object id across the video. */
export interface Track {
  objectId: number;
  detections: Detection[];
}

export type VerifyVerdict = "match" | "lookalike" | "unclear";

export interface TrackVerification {
  objectId: number;
  verdict: VerifyVerdict;
  visibility: "clear" | "partial" | "blurred";
  reason: string;
}

export interface Mention {
  startSec: number;
  endSec: number;
  text: string;
}

export interface Segment {
  startSec: number;
  endSec: number; // exclusive
}

export interface VideoMetrics {
  secondsOnScreen: number;
  shareOfVideo: number; // secondsOnScreen / durationSec
  firstSeenSec: number | null;
  longestRunSec: number;
  avgAreaFraction: number; // mean over frames where visible
  centerWeightedSec: number; // seconds weighted by closeness to frame centre
  prominenceScore: number; // 0..100
  segments: Segment[];
  mentions: Mention[];
  /** Frame indices actually detected on screen (segments also cover bridged gaps). Older reports lack it. */
  visibleFrames?: number[];
}

/** A plain-English contract term turned into a typed rule by Muse Spark. */
export type ContractRule =
  | { kind: "min_seconds_total"; seconds: number }
  | { kind: "min_seconds_within"; seconds: number; withinFirstSec: number }
  | { kind: "min_continuous"; seconds: number }
  | { kind: "min_area"; fraction: number; forSeconds: number }
  | { kind: "mentioned"; minTimes: number; withinFirstSec?: number }
  | { kind: "first_seen_before"; seconds: number };

export interface ContractTerm {
  text: string; // as the brand wrote it
  rule: ContractRule | null; // null = could not be turned into a checkable rule
}

export interface TermResult {
  term: ContractTerm;
  pass: boolean | null; // null = not checkable
  evidence: Segment[]; // where to jump to
  detail: string;
}

export interface VideoReport {
  videoId: string;
  info: VideoInfo;
  prompt: string;
  tracks: TrackVerification[];
  metrics: VideoMetrics;
  terms: TermResult[];
  cost: { samFrames: number; usd: number };
}
