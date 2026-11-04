// The "check it yourself" player's data: for one labelled LaCroix Reel, every frame marked by whether a person labelled
// the can on screen and whether Screen-Time counted it, from the label file (data/labels/lacroix) and the scored run's
// report (data/runs). Scored exactly as `pnpm accuracy` scores it: label ranges are inclusive frame ranges at 15 fps,
// and the counted frames are the report's visibleFrames (SAM 3.1 tracked them and Muse Spark confirmed the object).
// Pure: no file access, so the page and the tests build the same arrays from the same JSON.
import { FPS, type Segment } from "@/lib/types";

/** One frame: "=" labelled and counted, "+" counted but not labelled (over-count), "-" labelled but not counted
 *  (miss), "." neither. A string keeps a 500-frame Reel at 500 bytes in the page. */
export type FrameMark = "=" | "+" | "-" | ".";

export interface LabelFile {
  id: string;
  checkedBy?: string;
  targets: { name: string; ranges: number[][] }[];
}

export interface RunReport {
  videoId: string;
  info: { frameCount?: number };
  metrics: { visibleFrames?: number[] };
  receipt?: { runId?: string };
}

export interface CheckReel {
  /** "lacroix/lc-1-michael" */
  clip: string;
  target: string;
  /** The campaign video this Reel is. */
  videoId: string;
  runId?: string;
  frameCount: number;
  /** One FrameMark per frame, frame 0 first. */
  marks: string;
  labelledFrames: number;
  countedFrames: number;
  overFrames: number;
  missFrames: number;
  /** Counted frames that are labelled, over all counted frames; null when nothing was counted. */
  precision: number | null;
  /** Labelled frames that were counted, over all labelled frames; null when nothing is labelled. */
  recall: number | null;
}

/** Every frame of one Reel, labels against the run. Throws when the two files do not describe the same clip. */
export function checkReel(labels: LabelFile, report: RunReport, target = labels.targets[0]?.name): CheckReel {
  const t = labels.targets.find((x) => x.name === target);
  if (!t) throw new Error(`${labels.id}: no labels for ${target}`);
  const visible = report.metrics.visibleFrames;
  if (!Array.isArray(visible)) throw new Error(`${labels.id}: the run's report has no visibleFrames`);
  const labelled = new Set<number>();
  for (const [a, b] of t.ranges) for (let f = a; f <= b; f++) labelled.add(f);
  const counted = new Set(visible);
  const last = Math.max(-1, ...labelled, ...counted);
  const frameCount = Math.max(report.info.frameCount ?? 0, last + 1);

  let marks = "";
  let over = 0;
  let miss = 0;
  let both = 0;
  for (let f = 0; f < frameCount; f++) {
    const l = labelled.has(f);
    const c = counted.has(f);
    marks += l && c ? "=" : c ? "+" : l ? "-" : ".";
    if (l && c) both++;
    else if (c) over++;
    else if (l) miss++;
  }
  return {
    clip: labels.id,
    target: t.name,
    videoId: report.videoId,
    runId: report.receipt?.runId,
    frameCount,
    marks,
    labelledFrames: labelled.size,
    countedFrames: counted.size,
    overFrames: over,
    missFrames: miss,
    precision: counted.size ? both / counted.size : null,
    recall: labelled.size ? both / labelled.size : null,
  };
}

/** The stretches of frames whose mark is one of `kinds`, in seconds: frame f covers [f/15, (f+1)/15). */
export function markSegments(marks: string, kinds: string, fps = FPS): Segment[] {
  const out: Segment[] = [];
  let start = -1;
  for (let f = 0; f <= marks.length; f++) {
    const on = f < marks.length && kinds.includes(marks[f]);
    if (on && start < 0) start = f;
    if (!on && start >= 0) {
      out.push({ startSec: start / fps, endSec: f / fps });
      start = -1;
    }
  }
  return out;
}

export interface SoFar {
  labelledSec: number;
  countedSec: number;
  overSec: number;
  missSec: number;
}

/** What has played by `sec`: frames whose start is before it, as the counter in the hero replay adds them up. */
export function soFar(marks: string, sec: number, fps = FPS): SoFar {
  const upto = Math.min(marks.length, Math.max(0, Math.ceil(sec * fps - 1e-6)));
  let l = 0;
  let c = 0;
  let o = 0;
  let m = 0;
  for (let f = 0; f < upto; f++) {
    const k = marks[f];
    if (k === "=") {
      l++;
      c++;
    } else if (k === "+") {
      c++;
      o++;
    } else if (k === "-") {
      l++;
      m++;
    }
  }
  return {
    labelledSec: l / fps,
    countedSec: c / fps,
    overSec: o / fps,
    missSec: m / fps,
  };
}

/** The first stretch where the two disagree, to jump to; null when they agree on every frame. */
export function firstDisagreement(marks: string, fps = FPS): (Segment & { kind: "over" | "miss" }) | null {
  const i = marks.search(/[+-]/);
  if (i < 0) return null;
  const k = marks[i];
  let j = i;
  while (j < marks.length && marks[j] === k) j++;
  return {
    startSec: i / fps,
    endSec: j / fps,
    kind: k === "+" ? "over" : "miss",
  };
}

/** A tracking box as the page sends it: [frame, objectId, matched (1) or not (0), x1, y1, x2, y2, confidence×100 or -1]. */
export type PackedBox = [number, number, 0 | 1, number, number, number, number, number];

interface StoredDetection {
  frame: number;
  objectId: number;
  verdict: string;
  confidence?: number;
  box?: { x1: number; y1: number; x2: number; y2: number };
}

/** The boxes of a stored run, packed small; only detections that carry a box. */
export function packBoxes(detections: StoredDetection[] | undefined): PackedBox[] {
  return (detections ?? []).flatMap((d) =>
    d.box
      ? [
          [
            d.frame,
            d.objectId,
            d.verdict === "match" ? 1 : 0,
            Math.round(d.box.x1),
            Math.round(d.box.y1),
            Math.round(d.box.x2),
            Math.round(d.box.y2),
            d.confidence === undefined ? -1 : Math.round(d.confidence * 100),
          ] as PackedBox,
        ]
      : [],
  );
}
