import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FPS } from "@/lib/types";
import { evenCrop, extractFrameJpeg, extractWav, normalizeVideo } from "./index";

const ffmpeg = ffmpegStatic as string;
let dir: string;

function make(name: string, size: string, opts: { audio?: boolean; rate?: number; seconds?: number } = {}): string {
  const out = join(dir, name);
  const seconds = opts.seconds ?? 1;
  const args = ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc=size=${size}:rate=${opts.rate ?? 30}:duration=${seconds}`];
  if (opts.audio) args.push("-f", "lavfi", "-i", `sine=frequency=440:sample_rate=44100:duration=${seconds}`);
  args.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p");
  if (opts.audio) args.push("-c:a", "aac", "-shortest");
  execFileSync(ffmpeg, [...args, out]);
  return out;
}

function jpegSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  // Walk JPEG markers to the SOF0/SOF2 header.
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xc0 || marker === 0xc2) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error("No SOF marker");
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "media-test-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("normalizeVideo", () => {
  it("downscales landscape to 960 wide at constant FPS with exact frame count", async () => {
    const src = make("land.mp4", "1280x720", { audio: true, rate: 30, seconds: 2 });
    const info = await normalizeVideo(src, join(dir, "land.norm.mp4"));
    expect(info).toEqual({ width: 960, height: 540, frameCount: 2 * FPS, durationSec: 2 });
  });

  it("keeps portrait orientation and handles odd frame rates without audio", async () => {
    const src = make("port.mp4", "1080x1920", { rate: 25, seconds: 1 });
    const out = join(dir, "port.norm.mp4");
    const info = await normalizeVideo(src, out);
    expect(info).toMatchObject({ width: 540, height: 960, frameCount: FPS, durationSec: 1 });
    expect(existsSync(out)).toBe(true);
  });

  it("never upscales a small video", async () => {
    const src = make("small.mp4", "320x240");
    const info = await normalizeVideo(src, join(dir, "small.norm.mp4"));
    expect(info).toMatchObject({ width: 320, height: 240, frameCount: FPS });
  });

  it("applies rotation metadata so a phone clip stays portrait", async () => {
    const land = make("rot-src.mp4", "1280x720");
    const rotated = join(dir, "rot.mp4");
    // A display matrix, as phones write it (the old "rotate" tag is ignored from ffmpeg 7, which Vercel runs).
    execFileSync(ffmpeg, ["-v", "error", "-y", "-display_rotation:v:0", "90", "-i", land, "-c", "copy", rotated]);
    const info = await normalizeVideo(rotated, join(dir, "rot.norm.mp4"));
    expect(info).toMatchObject({ width: 540, height: 960, frameCount: FPS });
  });

  it("rejects a missing file", async () => {
    await expect(normalizeVideo(join(dir, "nope.mp4"), join(dir, "nope.out.mp4"))).rejects.toThrow();
  });
});

describe("extractWav", () => {
  it("writes 16 kHz mono s16 WAV", async () => {
    const src = make("av.mp4", "320x240", { audio: true });
    const out = await extractWav(src, join(dir, "av.wav"));
    expect(out).toBe(join(dir, "av.wav"));
    const header = readFileSync(out!).subarray(0, 44);
    expect(header.toString("ascii", 0, 4)).toBe("RIFF");
    expect(header.readUInt16LE(20)).toBe(1); // PCM
    expect(header.readUInt16LE(22)).toBe(1); // mono
    expect(header.readUInt32LE(24)).toBe(16000);
    expect(header.readUInt16LE(34)).toBe(16); // bits per sample
  });

  it("returns null for a video without audio", async () => {
    const src = make("mute.mp4", "320x240");
    const out = join(dir, "mute.wav");
    expect(await extractWav(src, out)).toBeNull();
    expect(existsSync(out)).toBe(false);
  });
});

describe("extractFrameJpeg", () => {
  let norm: string;

  beforeAll(async () => {
    norm = join(dir, "frames.norm.mp4");
    await normalizeVideo(make("frames.mp4", "640x360", { seconds: 2 }), norm);
  });

  it("returns exactly the requested frame", async () => {
    for (const frame of [0, 7, 22, 29]) {
      const seeked = await extractFrameJpeg(norm, frame, join(dir, `seek-${frame}.jpg`));
      const reference = join(dir, `ref-${frame}.jpg`);
      execFileSync(ffmpeg, ["-v", "error", "-y", "-i", norm, "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1", "-q:v", "3", "-an", reference]);
      expect(readFileSync(seeked).equals(readFileSync(reference)), `frame ${frame}`).toBe(true);
    }
  });

  it("does not return a neighbouring frame (negative control)", async () => {
    const a = readFileSync(await extractFrameJpeg(norm, 10, join(dir, "n10.jpg")));
    const b = readFileSync(await extractFrameJpeg(norm, 11, join(dir, "n11.jpg")));
    expect(a.equals(b)).toBe(false);
  });

  it("crops to the padded box", async () => {
    const out = await extractFrameJpeg(norm, 5, join(dir, "crop.jpg"), { x1: 100, y1: 50, x2: 199, y2: 149 }, 0.1);
    expect(jpegSize(out)).toEqual({ width: 120, height: 120 });
  });

  it("expands odd-sized crops to even dimensions inside the frame", async () => {
    const out = await extractFrameJpeg(norm, 5, join(dir, "crop-odd.jpg"), { x1: 100, y1: 50, x2: 100 + 98, y2: 50 + 56 }, 0);
    expect(jpegSize(out)).toEqual({ width: 100, height: 58 });
  });

  it("expands a 1-pixel crop to at least 2x2, even at the frame's far corner", async () => {
    const mid = await extractFrameJpeg(norm, 5, join(dir, "crop-1px.jpg"), { x1: 10, y1: 10, x2: 10, y2: 10 }, 0);
    expect(jpegSize(mid)).toEqual({ width: 2, height: 2 });
    const corner = await extractFrameJpeg(norm, 5, join(dir, "crop-corner.jpg"), { x1: 639, y1: 359, x2: 639, y2: 359 }, 0);
    expect(jpegSize(corner)).toEqual({ width: 2, height: 2 });
  });

  it("rejects a frame past the end instead of returning a missing or stale file", async () => {
    const out = join(dir, "past-end.jpg");
    await extractFrameJpeg(norm, 0, out);
    await expect(extractFrameJpeg(norm, 2 * FPS, out)).rejects.toThrow(/past the end/);
    expect(existsSync(out)).toBe(false);
  });

  it("rejects a negative frame", async () => {
    await expect(extractFrameJpeg(norm, -1, join(dir, "bad.jpg"))).rejects.toThrow();
  });
});

describe("evenCrop", () => {
  it("grows odd sizes to even and keeps the rect inside the frame", () => {
    expect(evenCrop({ x: 10, y: 10, w: 1, h: 1 }, 640, 360)).toEqual({ x: 10, y: 10, w: 2, h: 2 });
    expect(evenCrop({ x: 639, y: 359, w: 1, h: 1 }, 640, 360)).toEqual({ x: 638, y: 358, w: 2, h: 2 });
    expect(evenCrop({ x: 0, y: 0, w: 99, h: 57 }, 640, 360)).toEqual({ x: 0, y: 0, w: 100, h: 58 });
    expect(evenCrop({ x: 0, y: 0, w: 641, h: 361 }, 641, 361)).toEqual({ x: 0, y: 0, w: 640, h: 360 });
  });

  it("makes the origin even too, growing left/up so yuv420p cannot shift the content", () => {
    expect(evenCrop({ x: 11, y: 13, w: 4, h: 4 }, 640, 360)).toEqual({ x: 10, y: 12, w: 6, h: 6 });
    expect(evenCrop({ x: 637, y: 357, w: 3, h: 3 }, 640, 360)).toEqual({ x: 636, y: 356, w: 4, h: 4 });
  });

  it("keeps the original box inside the even crop", () => {
    for (const [width, height] of [[640, 360], [641, 361]]) {
      for (let x = 0; x < 40; x++) {
        for (let w = 1; x + w <= width && w < 40; w += 3) {
          const r = { x: width - 1 - x - w, y: x % 7, w, h: w };
          // An odd frame cannot hold an even crop reaching its last column; skip only those.
          if (r.x < 0 || (width % 2 && r.x + r.w === width)) continue;
          const c = evenCrop(r, width, height);
          expect(c.x % 2 + c.y % 2 + c.w % 2 + c.h % 2).toBe(0);
          expect(c.x).toBeLessThanOrEqual(r.x);
          expect(c.y).toBeLessThanOrEqual(r.y);
          expect(c.x + c.w).toBeGreaterThanOrEqual(r.x + r.w);
          expect(c.y + c.h).toBeGreaterThanOrEqual(r.y + r.h);
          expect(c.x + c.w).toBeLessThanOrEqual(width);
          expect(c.y + c.h).toBeLessThanOrEqual(height);
        }
      }
    }
  });
});

describe("ffmpeg process limits", () => {
  const original = process.env.FFMPEG_PATH;
  afterAll(() => {
    if (original === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = original;
  });

  function fakeFfmpeg(name: string, body: string): string {
    const path = join(dir, name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
    return path;
  }

  it("passes -nostdin so ffmpeg never waits on the terminal", async () => {
    const argsFile = join(dir, "args.txt");
    process.env.FFMPEG_PATH = fakeFfmpeg("echo-ffmpeg.sh", `echo "$@" > ${argsFile}; exit 1`);
    await expect(normalizeVideo(join(dir, "x.mp4"), join(dir, "x.out.mp4"))).rejects.toThrow();
    expect(readFileSync(argsFile, "utf8").split(" ")).toContain("-nostdin");
  });

  it("kills a hung ffmpeg after the timeout and names the timeout", async () => {
    process.env.FFMPEG_PATH = fakeFfmpeg("hang-ffmpeg.sh", "exec sleep 30");
    const started = Date.now();
    await expect(normalizeVideo(join(dir, "x.mp4"), join(dir, "x.out.mp4"), { timeoutMs: 300 })).rejects.toThrow(/timed out after 300 ms/);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("reports a signal kill as a signal, not an exit code", async () => {
    process.env.FFMPEG_PATH = fakeFfmpeg("killed-ffmpeg.sh", "kill -9 $$");
    await expect(normalizeVideo(join(dir, "x.mp4"), join(dir, "x.out.mp4"))).rejects.toThrow(/killed by SIGKILL/);
  });

  it("a fast clean exit is not reported as a timeout (negative control)", async () => {
    process.env.FFMPEG_PATH = fakeFfmpeg("fail-ffmpeg.sh", "echo boom >&2; exit 3");
    await expect(normalizeVideo(join(dir, "x.mp4"), join(dir, "x.out.mp4"), { timeoutMs: 5000 })).rejects.toThrow(/exited 3: boom/);
  });
});
