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
  | { kind: "first_seen_before"; seconds: number }
  /** The sponsorship is disclosed (FTC): said aloud ("ad", "sponsored", "paid partnership") or shown on screen. */
  | { kind: "disclosed" };

/** Where the video discloses the sponsorship. Spoken comes from the transcript; on-screen from Muse Spark reading
 *  sampled frames for text the creator burned into the video (#ad, "Sponsored"). The app's own "Paid partnership" label is
 *  added by the platform's UI and is never in the uploaded file. */
export interface Disclosure {
  spoken: Mention[];
  onScreen: { startSec: number; text: string }[];
  /** True when the frames were read for on-screen text; false when that check failed (onScreen is then empty and
   *  unknown, not "none"). Absent in reports made before the field existed, which always ran it. */
  onScreenChecked?: boolean;
}

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

/** One SAM pass: the prompt it tracked, what it found, and why another prompt was tried after it. */
export interface PromptAttempt {
  prompt: string;
  objects: number; // objects SAM tracked
  matched: number; // of those, confirmed as the brand's product
  samFrames: number;
  /** Muse Spark's reason for trying another prompt next. */
  next?: string;
}

export interface VideoReport {
  videoId: string;
  info: VideoInfo;
  prompt: string;
  tracks: TrackVerification[];
  metrics: VideoMetrics;
  terms: TermResult[];
  cost: { samFrames: number; usd: number };
  /** Where the sponsorship was disclosed. Older reports lack it. */
  disclosure?: Disclosure;
  /** True when Muse Spark compared each find against the brand's product photo, not only its description. */
  usedProductPhoto?: boolean;
  /** The product photo this run compared against (the campaign's photo at run time), set only when usedProductPhoto.
   *  The campaign's current photo may have changed since. */
  productImageUrl?: string;
  /** Present when the first prompt found nothing and Muse Spark suggested another, in order; `prompt` is the one used. */
  promptAttempts?: PromptAttempt[];
  /** Every tracked box with its object's verdict, so the player can draw the overlay. Older reports lack it. */
  detections?: (Detection & { verdict: VerifyVerdict })[];
}

/**
 * What a run has found so far, written as each stage finishes so the run page can show the analysis as it happens.
 * Every field is real output of that stage; a replay of a finished report builds the same shape from the report.
 */
export interface LiveProgress {
  video?: { frameCount: number; durationSec: number; width: number; height: number };
  /** One per SAM 3.1 pass: the prompt, how many objects it tracked, and a few of its boxes for the filmstrip. */
  searches?: { prompt: string; objects: number; samFrames: number; boxes: (Detection & { verdict?: VerifyVerdict })[] }[];
  /** Muse Spark's call on each tracked object, as each one comes back. */
  checks?: { prompt: string; objectId: number; verdict: VerifyVerdict; reason: string }[];
  /** Voice Transcribe: the brand mentions and spoken disclosures heard. `audio` is false when the video has no sound,
   *  and absent when not known (a replay of an older report). */
  heard?: { audio?: boolean; mentions: Mention[]; disclosures: Mention[] };
  measured?: { secondsOnScreen: number; shareOfVideo: number; firstSeenSec: number | null };
  terms?: { text: string; pass: boolean | null; detail: string }[];
}
