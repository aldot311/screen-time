import { describe, expect, it } from "vitest";
import { FPS } from "../types";
import { boxFootprint } from "./geometry";
import { frameToSec, maskFootprint, parseSamVideo, parseSseEvents } from "./index";
import {
  DIAGONAL_8,
  EMPTY_3,
  FULL_4x6,
  README_LINE,
  TOP_HALF_10,
  ZERO_MATCHES_BARE,
  line,
  record,
  sseBody,
} from "./fixtures/sse-fixtures";

const FRAME = { width: 100, height: 50 };

// Frames 0, 1 and 4: frames 2 and 3 had nothing visible, so the API emitted no line for them.
const multiFrame = [
  line(0, record(0, [10, 20, 19, 29], TOP_HALF_10, undefined, 0.9), record(2, [60, 10, 65, 13], FULL_4x6, undefined, 0.8)),
  line(1, record(0, [10, 20, 19, 29], TOP_HALF_10, undefined, 0.85)),
  line(4, record(2, [60, 10, 67, 17], DIAGONAL_8)),
];

function streamOf(text: string, chunkSize: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  });
}

describe("parseSamVideo", () => {
  it("parses several objects over several frames into detections and tracks", async () => {
    const result = await parseSamVideo(sseBody(multiFrame), FRAME);

    expect(result.diagnostics).toEqual([]);
    expect(result.framesProcessed).toBe(50);
    expect(result.detections.map((d) => [d.frame, d.objectId])).toEqual([
      [0, 0],
      [0, 2],
      [1, 0],
      [4, 2],
    ]);
    expect(result.tracks.map((t) => [t.objectId, t.detections.map((d) => d.frame)])).toEqual([
      [0, [0, 1]],
      [2, [0, 4]],
    ]);
    const first = result.detections[0];
    expect(first.box).toEqual({ x1: 10, y1: 20, x2: 19, y2: 29 });
    expect(first.confidence).toBe(0.9);
    expect(result.detections[3].confidence).toBeUndefined();
  });

  it("keeps the explicit frame index when frames are skipped", async () => {
    const { detections } = await parseSamVideo(sseBody(multiFrame), FRAME);
    const frames = new Set(detections.map((d) => d.frame));
    expect([...frames]).toEqual([0, 1, 4]);
    expect(frameToSec(detections[3].frame)).toBeCloseTo(4 / FPS);
  });

  it("computes area and centroid from a known mask", async () => {
    const { detections } = await parseSamVideo(sseBody(multiFrame), FRAME);
    // Box 10..19 x 20..29, mask rows 0-4 set: 50 px of 5000, centre at (15, 22.5).
    expect(detections[0].areaFraction).toBeCloseTo(50 / 5000);
    expect(detections[0].centroid.x).toBeCloseTo(0.15);
    expect(detections[0].centroid.y).toBeCloseTo(0.45);
    // Full 6x4 block at 60..65 x 10..13: 24 px, centre at (63, 12).
    expect(detections[1].areaFraction).toBeCloseTo(24 / 5000);
    expect(detections[1].centroid).toEqual({ x: expect.closeTo(0.63), y: expect.closeTo(0.24) });
    // 8x8 diagonal at 60..67 x 10..17: 8 px, mean col/row 3.5, centre at (64, 14).
    expect(detections[3].areaFraction).toBeCloseTo(8 / 5000);
    expect(detections[3].centroid).toEqual({ x: expect.closeTo(0.64), y: expect.closeTo(0.28) });
  });

  it("returns nothing for zero matches with no text lane", async () => {
    const result = await parseSamVideo(ZERO_MATCHES_BARE, FRAME);
    expect(result).toEqual({ detections: [], tracks: [], framesProcessed: 50, diagnostics: [] });
  });

  it("returns nothing for zero matches with an empty text lane", async () => {
    const result = await parseSamVideo(sseBody([]), FRAME);
    expect(result.detections).toEqual([]);
    expect(result.tracks).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("falls back to the box when a mask cannot be decoded", async () => {
    const broken = line(3, record(5, [0, 0, 9, 4], "data=5,10,!zzzz"));
    const { detections, diagnostics } = await parseSamVideo(sseBody([broken]), FRAME);
    expect(detections).toHaveLength(1);
    expect(detections[0].areaFraction).toBeCloseTo(50 / 5000);
    expect(detections[0].centroid).toEqual({ x: expect.closeTo(0.05), y: expect.closeTo(0.05) });
    expect(diagnostics[0]).toMatch(/invalid_mask_payload/);
  });

  it("gives an empty mask zero area", async () => {
    const { detections } = await parseSamVideo(sseBody([line(0, record(1, [30, 30, 32, 32], EMPTY_3))]), FRAME);
    expect(detections[0].areaFraction).toBe(0);
    expect(detections[0].centroid).toEqual({ x: expect.closeTo(0.315), y: expect.closeTo(0.63) });
  });

  it("reads a byte stream split mid-event, and the README's lossless example", async () => {
    const result = await parseSamVideo(streamOf(sseBody([README_LINE]), 7), { width: 320, height: 334 });
    expect(result.diagnostics).toEqual([]); // masks decoded, not the box fallback
    expect(result.detections.map((d) => d.objectId)).toEqual([0, 1]);
    expect(result.detections[0].box).toEqual({ x1: 211, y1: 228, x2: 270, y2: 254 });
    for (const d of result.detections) {
      expect(d.areaFraction).toBeGreaterThan(0);
      expect(d.areaFraction).toBeLessThanOrEqual((60 * 27) / (320 * 334));
      expect(d.centroid.y).toBeGreaterThan(228 / 334);
      expect(d.centroid.y).toBeLessThan(255 / 334);
    }
  });

  it("accepts already-parsed events, as from the OpenAI SDK", async () => {
    async function* events() {
      yield* parseSseEvents(sseBody(multiFrame));
    }
    const { detections } = await parseSamVideo(events(), FRAME);
    expect(detections).toHaveLength(4);
  });

  it("surfaces a failed response as an error", async () => {
    const failed = `data: ${JSON.stringify({ type: "response.failed", response: { error: { message: "boom" } } })}\n\n`;
    await expect(parseSamVideo(failed, FRAME)).rejects.toThrow("boom");
  });

  it("raises a refusal that ends in response.completed instead of reading it as zero matches", async () => {
    const lane = { item_id: "msg_1", output_index: 0, content_index: 0 };
    const refusal = [
      { type: "response.refusal.delta", ...lane, delta: "cannot help" },
      { type: "response.refusal.done", ...lane, refusal: "cannot help" },
      { type: "response.completed", response: { id: "resp_1", usage: { video_frames_processed: 50 } } },
    ]
      .map((e) => `data: ${JSON.stringify(e)}\n\n`)
      .join("");
    await expect(parseSamVideo(refusal, FRAME)).rejects.toThrow();
  });

  it("throws on a stream cut off before response.completed instead of returning partial detections", async () => {
    const cut = sseBody(multiFrame).split("event: response.completed")[0];
    await expect(parseSamVideo(cut, FRAME)).rejects.toThrow(/did not complete|incomplete|ended/i);
  });

  it("throws on response.incomplete", async () => {
    const body = sseBody(multiFrame).replace(
      /event: response\.completed\ndata: .*\n\n$/,
      `data: ${JSON.stringify({ type: "response.incomplete", response: { id: "resp_1", incomplete_details: { reason: "max_output_tokens" } } })}\n\n`,
    );
    expect(body).toContain("response.incomplete");
    await expect(parseSamVideo(body, FRAME)).rejects.toThrow();
  });

  it("throws when an error event precedes response.completed with no lane", async () => {
    const error = `data: ${JSON.stringify({ type: "error", message: "rate limited" })}\n\n`;
    await expect(parseSamVideo(error + ZERO_MATCHES_BARE, FRAME)).rejects.toThrow(/rate limited/);
  });

  it("throws when response.failed precedes response.completed with no lane", async () => {
    const failed = `data: ${JSON.stringify({ type: "response.failed", response: { error: { message: "boom" } } })}\n\n`;
    await expect(parseSamVideo(failed + ZERO_MATCHES_BARE, FRAME)).rejects.toThrow(/boom/);
  });

  it("throws when an error event appears in a stream that has a lane and completes", async () => {
    const error = `data: ${JSON.stringify({ type: "error", message: "mid-stream error" })}\n\n`;
    const [head, tail] = sseBody(multiFrame).split("event: response.completed");
    await expect(parseSamVideo(`${head}${error}event: response.completed${tail}`, FRAME)).rejects.toThrow(/mid-stream error/);
  });

  it("treats an unparseable final data line as truncation, with a clear error", async () => {
    const cut = sseBody(multiFrame).split("event: response.completed")[0] + 'data: {"type":"response.compl';
    await expect(parseSamVideo(cut, FRAME)).rejects.toThrow(/did not complete|incomplete|ended/i);
    await expect(parseSamVideo(cut, FRAME)).rejects.not.toThrow(SyntaxError);
  });

  it("still throws on a malformed event in the middle of the stream", async () => {
    const body = 'data: {"type":"response.created"\n\n' + sseBody(multiFrame);
    expect(() => parseSseEvents(body)).toThrow(/malformed|JSON|Unexpected|Expected/i);
  });

  it("accepts a plain array of parsed events", async () => {
    const { detections } = await parseSamVideo(parseSseEvents(sseBody(multiFrame)), FRAME);
    expect(detections).toHaveLength(4);
  });

  it("flags boxes reported in a different frame size than info", async () => {
    const { diagnostics, detections } = await parseSamVideo(sseBody(multiFrame), { width: 200, height: 100 });
    expect(detections).toHaveLength(4);
    expect(diagnostics).toEqual([expect.stringMatching(/frame_size_mismatch: boxes are in a 100x50 frame but info is 200x100/)]);
  });

  it("rejects a missing frame size", async () => {
    await expect(parseSamVideo(sseBody([]), { width: 0, height: 50 })).rejects.toThrow(/frame width/);
  });
});

describe("maskFootprint", () => {
  it("scales a mask whose raster is smaller than its box", () => {
    // 2x2 raster over a 4x4 box: one set pixel stands for a 2x2 block.
    const raster = Uint8Array.from([0, 0, 0, 1]);
    const result = maskFootprint(raster, 2, 2, { left: 0, top: 0, right: 4, bottom: 4 }, { width: 10, height: 10 });
    expect(result.areaFraction).toBeCloseTo(4 / 100);
    expect(result.centroid).toEqual({ x: expect.closeTo(0.3), y: expect.closeTo(0.3) });
  });
});

describe("boxFootprint", () => {
  it("returns 0, not NaN, when the frame size is zero", () => {
    const result = boxFootprint({ left: 0, top: 0, right: 0, bottom: 0 }, { width: 0, height: 0 });
    expect(result).toEqual({ areaFraction: 0, centroid: { x: 0, y: 0 } });
  });
});

describe("frameToSec", () => {
  it("divides by the normalized frame rate", () => {
    expect(frameToSec(0)).toBe(0);
    expect(frameToSec(FPS)).toBe(1);
    expect(frameToSec(45)).toBeCloseTo(45 / FPS);
  });
});
