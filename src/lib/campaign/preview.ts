// The built-in "Alani Nu: preview" campaign. SYNTHETIC: every number comes from hand labels in data/labels run
// through the real metrics and rule code, not from a Meta API run. Boxes are made up around the labelled frames.
import clip01 from "../../../data/labels/clip01.json";
import clip02 from "../../../data/labels/clip02.json";
import clip03 from "../../../data/labels/clip03.json";
import clip04 from "../../../data/labels/clip04.json";
import clip05 from "../../../data/labels/clip05.json";
import clip09 from "../../../data/labels/clip09.json";
import clip10 from "../../../data/labels/clip10.json";
import clip11 from "../../../data/labels/clip11.json";
import clip12 from "../../../data/labels/clip12.json";
import clip13 from "../../../data/labels/clip13.json";
import clip14 from "../../../data/labels/clip14.json";
import clip15 from "../../../data/labels/clip15.json";
import { checkTerms, computeMetrics, frameSamples } from "@/lib/metrics";
import { FPS, type ContractTerm, type Detection, type TrackVerification, type VerifyVerdict, type VideoReport } from "@/lib/types";
import type { Campaign, VideoEntry } from "./types";

export const PREVIEW_ID = "preview";
const TARGET = "alani-can";
// A fixed date so the preview never looks like it changed between requests.
const CREATED_AT = "2026-10-28T12:00:00.000Z";
// Every local clip is 540x960 at 15 fps; frame counts measured from data/videos so this needs no ffmpeg at runtime.
const WIDTH = 540;
const HEIGHT = 960;

interface LabelFile {
  id: string;
  targets: { name: string; prompt: string; product: string; brandTerms: string[]; ranges: number[][] }[];
}

interface PreviewClip {
  labels: LabelFile;
  frameCount: number;
  creator: string;
  /** Frames of a tracked object that verification rejects, for the look-alike clip. */
  lookalike?: [number, number];
}

const CLIPS: PreviewClip[] = [
  { labels: clip01, frameCount: 167, creator: "@aldo.tile" },
  { labels: clip02, frameCount: 180, creator: "@aldo.tile" },
  { labels: clip03, frameCount: 211, creator: "@aldo.daily" },
  { labels: clip04, frameCount: 193, creator: "@aldo.daily" },
  { labels: clip05, frameCount: 264, creator: "@aldo.eats", lookalike: [40, 200] },
  { labels: clip09, frameCount: 172, creator: "@aldo.eats" },
  { labels: clip10, frameCount: 230, creator: "@aldo.gym" },
  { labels: clip11, frameCount: 452, creator: "@aldo.gym" },
  { labels: clip12, frameCount: 174, creator: "@aldo.tile" },
  { labels: clip13, frameCount: 140, creator: "@aldo.daily" },
  { labels: clip14, frameCount: 177, creator: "@aldo.eats" },
  { labels: clip15, frameCount: 111, creator: "@aldo.gym" },
];

const PRODUCT = "a slim teal Alani Nu energy drink can with a peach graphic and pink 'Alani' script logo";

const TERMS: ContractTerm[] = [
  { text: "On screen at least 3 seconds in total", rule: { kind: "min_seconds_total", seconds: 3 } },
  {
    text: "On screen at least 2 seconds within the first 5 seconds",
    rule: { kind: "min_seconds_within", seconds: 2, withinFirstSec: 5 },
  },
  // Audio is not part of the preview (it has no transcript), so every term here is visual.
  { text: "One continuous shot of at least 2 seconds", rule: { kind: "min_continuous", seconds: 2 } },
];

const MATCH_REASON = "Slim teal Alani Nu can with the pink script logo.";
const LOOKALIKE_REASON = "Coconut-water can: white with a blue band, not the teal Alani Nu can";

export function previewCampaign(): Campaign {
  return {
    id: PREVIEW_ID,
    name: "Alani Nu: preview",
    brand: "Alani Nu",
    prompt: "drink can",
    productDescription: PRODUCT,
    brandTerms: ["Alani", "Alani Nu"],
    contractTerms: TERMS.map((t) => t.text),
    createdAt: CREATED_AT,
    synthetic: true,
  };
}

let cached: VideoEntry[] | null = null;

export function previewVideos(): VideoEntry[] {
  cached ??= CLIPS.map(previewVideo);
  // Callers get their own copies, so nothing can mutate the shared preview.
  return structuredClone(cached);
}

function previewVideo(clip: PreviewClip): VideoEntry {
  const id = clip.labels.id;
  return {
    id,
    campaignId: PREVIEW_ID,
    creator: clip.creator,
    title: `${id}.mp4 (synthetic preview)`,
    videoUrl: `/api/dev/video?id=${id}`,
    status: "done",
    step: "contract",
    report: previewReport(clip),
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    synthetic: true,
  };
}

export function previewReport(clip: PreviewClip): VideoReport {
  const target = clip.labels.targets.find((t) => t.name === TARGET);
  const info = { width: WIDTH, height: HEIGHT, frameCount: clip.frameCount, durationSec: clip.frameCount / FPS };
  const matched = framesOf(target?.ranges ?? [], clip.frameCount).map((f) => syntheticDetection(f, 0, 1));
  const rejected = clip.lookalike ? framesOf([clip.lookalike], clip.frameCount).map((f) => syntheticDetection(f, 1, 2)) : [];

  const tracks: TrackVerification[] = [];
  if (matched.length) tracks.push({ objectId: 0, verdict: "match", visibility: "clear", reason: MATCH_REASON });
  if (rejected.length) tracks.push({ objectId: 1, verdict: "lookalike", visibility: "clear", reason: LOOKALIKE_REASON });

  const metrics = computeMetrics(matched, info, []);
  const tag = (verdict: VerifyVerdict) => (d: Detection) => ({ ...d, verdict });
  return {
    videoId: clip.labels.id,
    info,
    prompt: "drink can",
    tracks,
    metrics,
    terms: checkTerms(TERMS, metrics, frameSamples(matched, info)),
    cost: { samFrames: 0, usd: 0 },
    detections: [...matched.map(tag("match")), ...rejected.map(tag("lookalike"))].sort(
      (a, b) => a.frame - b.frame || a.objectId - b.objectId,
    ),
  };
}

function framesOf(ranges: number[][], frameCount: number): number[] {
  const frames = new Set<number>();
  for (const [a, b] of ranges) for (let f = a; f <= Math.min(b, frameCount - 1); f++) frames.add(f);
  return [...frames].sort((x, y) => x - y);
}

/** A can-shaped box drifting gently around the centre, its mask covering 4-12% of the frame. */
export function syntheticDetection(frame: number, objectId: number, seed: number): Detection {
  const areaFraction = 0.08 + 0.04 * Math.sin(frame / 9 + seed);
  const centroid = { x: 0.5 + 0.08 * Math.sin(frame / 13 + seed), y: 0.55 + 0.06 * Math.cos(frame / 11 + seed) };
  // The mask fills about 80% of its box; a slim can is about 2.2 times taller than wide.
  const boxPx = (areaFraction * WIDTH * HEIGHT) / 0.8;
  const h = Math.sqrt(boxPx * 2.2);
  const w = boxPx / h;
  const cx = centroid.x * WIDTH;
  const cy = centroid.y * HEIGHT;
  return {
    frame,
    objectId,
    box: { x1: Math.round(cx - w / 2), y1: Math.round(cy - h / 2), x2: Math.round(cx + w / 2), y2: Math.round(cy + h / 2) },
    areaFraction: Math.round(areaFraction * 1e4) / 1e4,
    centroid: { x: Math.round(centroid.x * 1e4) / 1e4, y: Math.round(centroid.y * 1e4) / 1e4 },
    confidence: 0.9,
  };
}
