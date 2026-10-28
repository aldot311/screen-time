import {
  decodeMaskToRaster,
  frameIndexOf,
  parseVideoStream,
  recordsOfKind,
  type SegmentationBoxRecord,
  type SegmentationMaskRecord,
} from "@meta-sam/parser";
import { FPS, type Detection, type Track } from "../types";
import { boxFootprint, maskFootprint, type FrameSize } from "./geometry";
import { parseSseEvents, readStreamText, type StreamEvent } from "./sse";

export type SamInput =
  | string
  | ReadableStream<Uint8Array | string>
  | AsyncIterable<StreamEvent>
  | readonly StreamEvent[];

export interface SamVideoResult {
  detections: Detection[]; // sorted by frame, then object id
  tracks: Track[]; // sorted by object id
  /** `usage.video_frames_processed` from `response.completed`, when present: the frames billed. */
  framesProcessed: number | null;
  /** Recoverable format problems the parser reported (dropped or partly ignored records). */
  diagnostics: string[];
}

export function frameToSec(frame: number): number {
  return frame / FPS;
}

/** Turns a streamed SAM 3.1 video response (SSE text, a body stream, or parsed events) into detections and tracks. */
export async function parseSamVideo(input: SamInput, info: FrameSize): Promise<SamVideoResult> {
  if (!(info.width > 0 && info.height > 0)) throw new Error("parseSamVideo needs a positive frame width and height");
  const events = await toEvents(input);
  assertCleanCompletion(events);
  const framesProcessed = readFramesProcessed(events);

  // Zero matches can arrive as a bare `response.completed` with no text lane, which the parser rejects.
  // assertCleanCompletion has already raised on any error, failed, incomplete or cut-off stream.
  if (!events.some(isLaneEvent)) return { detections: [], tracks: [], framesProcessed, diagnostics: [] };

  const result = await parseVideoStream(fromArray(events)).finalResult;
  const detections = toDetections(
    recordsOfKind(result.records, "box"),
    recordsOfKind(result.records, "mask"),
    info,
  );
  const diagnostics = result.diagnostics.map((d) => `${d.severity} ${d.code} on line ${d.line}: ${d.message}`);
  diagnostics.push(...frameSizeMismatches(result.rawOutput, info));
  // Verdicts must never be computed on partial tracking.
  if (result.outcome.status !== "completed") throw new Error(`SAM stream did not complete: ${JSON.stringify(result.outcome)}`);
  return { detections, tracks: toTracks(detections), framesProcessed, diagnostics };
}

export function toDetections(
  boxes: readonly SegmentationBoxRecord[],
  masks: readonly SegmentationMaskRecord[],
  frame: FrameSize,
): Detection[] {
  // Later records for the same frame and object replace earlier ones (a mask's `revision` increases).
  const masksByKey = new Map(masks.map((m) => [keyOf(m), m]));
  const boxesByKey = new Map(boxes.map((b) => [keyOf(b), b]));
  const detections = [...boxesByKey.values()].map((box) => toDetection(box, masksByKey.get(keyOf(box)), frame));
  return detections.sort((a, b) => a.frame - b.frame || a.objectId - b.objectId);
}

export function toTracks(detections: readonly Detection[]): Track[] {
  const byId = new Map<number, Detection[]>();
  for (const d of detections) {
    const list = byId.get(d.objectId) ?? [];
    list.push(d);
    byId.set(d.objectId, list);
  }
  return [...byId.entries()]
    .sort(([a], [b]) => a - b)
    .map(([objectId, list]) => ({ objectId, detections: list.sort((a, b) => a.frame - b.frame) }));
}

function toDetection(box: SegmentationBoxRecord, mask: SegmentationMaskRecord | undefined, frame: FrameSize): Detection {
  const bounds = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  const raster = mask === undefined ? undefined : tryDecode(mask);
  const footprint =
    mask !== undefined && raster !== undefined
      ? maskFootprint(raster, mask.mask.width, mask.mask.height, mask.bounds, frame)
      : boxFootprint(bounds, frame);
  const confidence = box.confidence ?? mask?.confidence;
  return {
    frame: frameIndexOf(box) ?? 0,
    objectId: Number(box.objectId),
    // The wire format has inclusive x2/y2; the parser normalizes to half-open, so step back by one.
    box: { x1: box.left, y1: box.top, x2: box.right - 1, y2: box.bottom - 1 },
    ...footprint,
    ...(confidence === undefined ? {} : { confidence }),
  };
}

function tryDecode(mask: SegmentationMaskRecord): Uint8Array | undefined {
  try {
    return decodeMaskToRaster(mask.mask);
  } catch {
    return undefined;
  }
}

function keyOf(record: SegmentationBoxRecord | SegmentationMaskRecord): string {
  return `${frameIndexOf(record) ?? 0}:${record.objectId}`;
}

async function toEvents(input: SamInput): Promise<StreamEvent[]> {
  if (typeof input === "string") return parseSseEvents(input);
  if (Array.isArray(input)) return [...(input as readonly StreamEvent[])];
  if ("getReader" in input) return parseSseEvents(await readStreamText(input));
  const events: StreamEvent[] = [];
  for await (const event of input) events.push(event);
  return events;
}

async function* fromArray(events: readonly StreamEvent[]): AsyncIterable<StreamEvent> {
  yield* events;
}

/** Raises on any error, failed or incomplete event, and on a stream that never reached `response.completed`. */
function assertCleanCompletion(events: readonly StreamEvent[]): void {
  for (const event of events) {
    if (event.type === "error") throw new Error(`SAM stream error: ${errorMessage(event)}`);
    if (event.type === "response.failed") throw new Error(`SAM response failed: ${errorMessage(event)}`);
    if (event.type === "response.incomplete") throw new Error(`SAM stream did not complete: ${errorMessage(event)}`);
  }
  if (!events.some((e) => e.type === "response.completed")) {
    throw new Error("SAM stream did not complete: it ended without response.completed (truncated or dropped)");
  }
}

function errorMessage(event: StreamEvent): string {
  const response = event.response as { error?: { message?: unknown }; incomplete_details?: unknown } | undefined;
  const message = event.message ?? response?.error?.message;
  if (typeof message === "string") return message;
  return JSON.stringify(response?.incomplete_details ?? event);
}

// A refusal is a lane too: it must reach the parser so it raises, not read as zero matches.
function isLaneEvent(event: StreamEvent): boolean {
  if (event.type.startsWith("response.output_text.") || event.type.startsWith("response.refusal.")) return true;
  if (event.type !== "response.content_part.done") return false;
  const part = event.part as { type?: unknown } | undefined;
  return part?.type === "output_text" || part?.type === "refusal";
}

/**
 * Boxes are in the pixels of the frame SAM saw (`w`/`h` on every box), which the parser checks but drops.
 * Area and centroid divide by `info`, so a different wire size would skew them silently; report it instead.
 */
export function frameSizeMismatches(rawOutput: string, info: FrameSize): string[] {
  const seen = new Set<string>();
  for (const [, fields] of rawOutput.matchAll(/<\|box;([^|]*)\|>/g)) {
    const w = /(?:^|;)w=(\d+)/.exec(fields)?.[1];
    const h = /(?:^|;)h=(\d+)/.exec(fields)?.[1];
    if (w !== undefined && h !== undefined && (Number(w) !== info.width || Number(h) !== info.height)) seen.add(`${w}x${h}`);
  }
  return [...seen].map((size) => `warning frame_size_mismatch: boxes are in a ${size} frame but info is ${info.width}x${info.height}`);
}

function readFramesProcessed(events: readonly StreamEvent[]): number | null {
  const completed = events.find((e) => e.type === "response.completed");
  const usage = (completed?.response as { usage?: { video_frames_processed?: unknown } } | undefined)?.usage;
  return typeof usage?.video_frames_processed === "number" ? usage.video_frames_processed : null;
}
