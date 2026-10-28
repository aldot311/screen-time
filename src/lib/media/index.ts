import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { FPS, type Box, type VideoInfo } from "@/lib/types";
import { parseProgressFrames, parseStreams } from "./parse";

export { parseProgressFrames, parseStreams } from "./parse";

export const MAX_EDGE = 960;
export const WAV_SAMPLE_RATE = 16000;
/** Default wall-clock limits per ffmpeg call; a stuck input is killed instead of hanging the request. */
export const NORMALIZE_TIMEOUT_MS = 120_000;
export const EXTRACT_TIMEOUT_MS = 30_000;

export interface RunOptions {
  /** Kill ffmpeg (SIGKILL) after this many ms. */
  timeoutMs?: number;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function ffmpegBinary(): string {
  const path = process.env.FFMPEG_PATH || ffmpegStatic;
  if (!path) throw new Error("ffmpeg-static has no binary for this platform; set FFMPEG_PATH");
  return path;
}

/** -nostdin keeps ffmpeg from reading or waiting on the parent's stdin. */
function run(args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegBinary(),
      ["-nostdin", ...args],
      { maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, killSignal: "SIGKILL" },
      (error, stdout, stderr) => {
        if (error && typeof error.code === "number") return resolve({ code: error.code, stdout, stderr });
        if (error?.killed) return reject(new Error(`ffmpeg timed out after ${timeoutMs} ms and was killed`));
        if (error?.signal) return reject(new Error(`ffmpeg was killed by ${error.signal}`));
        if (error) return reject(error);
        resolve({ code: 0, stdout, stderr });
      },
    );
  });
}

async function runOrThrow(args: string[], timeoutMs: number): Promise<RunResult> {
  const result = await run(args, timeoutMs);
  if (result.code !== 0) {
    const tail = result.stderr.trim().split("\n").slice(-5).join("\n");
    throw new Error(`ffmpeg exited ${result.code}: ${tail}`);
  }
  return result;
}

/** `ffmpeg -i` with no output exits 1 by design; we only want its stream listing. Sizes are pre-rotation. */
async function probe(inPath: string, timeoutMs: number) {
  const { stderr } = await run(["-hide_banner", "-i", inPath], timeoutMs);
  if (/No such file|Invalid data found/.test(stderr)) throw new Error(`Cannot read ${inPath}`);
  return parseStreams(stderr);
}

async function countFrames(path: string, timeoutMs: number): Promise<number> {
  const { stdout } = await runOrThrow([
    "-v", "error", "-nostats", "-i", path, "-map", "0:v:0", "-c", "copy", "-f", "null", "-progress", "pipe:1", "-",
  ], timeoutMs);
  return parseProgressFrames(stdout);
}

/** Scale so the longest edge is at most MAX_EDGE, never upscaling, both sides even (yuv420p needs that).
 *  ffmpeg autorotates before filters, so iw/ih here are already the display orientation. */
export function scaleFilter(maxEdge = MAX_EDGE): string {
  const long = `2*trunc(min(${maxEdge},max(iw,ih))/2)`;
  return `scale=w='if(gte(iw,ih),${long},-2)':h='if(gte(iw,ih),-2,${long})'`;
}

export async function normalizeVideo(inPath: string, outPath: string, opts: RunOptions = {}): Promise<VideoInfo> {
  const timeoutMs = opts.timeoutMs ?? NORMALIZE_TIMEOUT_MS;
  await runOrThrow([
    "-v", "error", "-y", "-i", inPath,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", `fps=${FPS},${scaleFilter()},setsar=1,format=yuv420p`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    "-map_metadata", "-1", "-movflags", "+faststart",
    outPath,
  ], timeoutMs);
  const [{ width, height }, frameCount] = await Promise.all([probe(outPath, timeoutMs), countFrames(outPath, timeoutMs)]);
  return { width, height, frameCount, durationSec: frameCount / FPS };
}

/** 16 kHz mono 16-bit PCM WAV, the format /v1/asr/transcribe accepts. Null when there is no audio track. */
export async function extractWav(inPath: string, outPath: string, opts: RunOptions = {}): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? EXTRACT_TIMEOUT_MS;
  const { hasAudio } = await probe(inPath, timeoutMs);
  if (!hasAudio) return null;
  await runOrThrow([
    "-v", "error", "-y", "-i", inPath,
    "-map", "0:a:0", "-vn", "-ac", "1", "-ar", String(WAV_SAMPLE_RATE), "-c:a", "pcm_s16le",
    "-map_metadata", "-1",
    outPath,
  ], timeoutMs);
  return outPath;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Inclusive box grown by `padding` (fraction of box size per side), clamped to the frame. */
export function paddedCrop(box: Box, padding: number, width: number, height: number): CropRect {
  const padX = Math.round((box.x2 - box.x1 + 1) * padding);
  const padY = Math.round((box.y2 - box.y1 + 1) * padding);
  const x1 = Math.max(0, Math.floor(box.x1) - padX);
  const y1 = Math.max(0, Math.floor(box.y1) - padY);
  const x2 = Math.min(width - 1, Math.ceil(box.x2) + padX);
  const y2 = Math.min(height - 1, Math.ceil(box.y2) + padY);
  if (x2 < x1 || y2 < y1) throw new Error("Crop box lies outside the frame");
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

/** Grow a crop to even width/height of at least 2 (yuv420p crop rounds odd sizes down, so 1 px became 0),
 *  shifting it back inside the frame when growing would cross the right/bottom edge. */
export function evenCrop(r: CropRect, width: number, height: number): CropRect {
  const fit = (pos: number, size: number, limit: number) => {
    const maxEven = limit - (limit % 2);
    const s = Math.min(Math.max(2, size + (size % 2)), maxEven);
    return { pos: Math.max(0, Math.min(pos, limit - s)), size: s };
  };
  const x = fit(r.x, r.w, width);
  const y = fit(r.y, r.h, height);
  return { x: x.pos, y: y.pos, w: x.size, h: y.size };
}

/** Seek half a frame early: accurate seek returns the first frame with pts >= t, so this lands on `frame`
 *  even when the decimal time rounds slightly past its exact timestamp. */
export function seekSeconds(frame: number): string {
  return Math.max(0, (frame - 0.5) / FPS).toFixed(6);
}

/**
 * JPEG of one frame of a normalized video (frame index at FPS). Box coordinates are normalized-video pixels.
 */
export async function extractFrameJpeg(
  inPath: string,
  frame: number,
  outPath: string,
  crop?: Box,
  padding = 0.15,
  opts: RunOptions = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? EXTRACT_TIMEOUT_MS;
  if (!Number.isInteger(frame) || frame < 0) throw new Error(`Invalid frame index ${frame}`);
  const filters: string[] = [];
  if (crop) {
    const { width, height } = await probe(inPath, timeoutMs);
    const r = evenCrop(paddedCrop(crop, padding, width, height), width, height);
    filters.push(`crop=${r.w}:${r.h}:${r.x}:${r.y}`);
  }
  // A seek past the last frame makes ffmpeg exit 0 without writing anything, so a stale file must not pass as output.
  rmSync(outPath, { force: true });
  await runOrThrow([
    "-v", "error", "-y", "-ss", seekSeconds(frame), "-i", inPath,
    ...(filters.length ? ["-vf", filters.join(",")] : []),
    "-frames:v", "1", "-q:v", "3", "-an",
    outPath,
  ], timeoutMs);
  if (!existsSync(outPath)) throw new Error(`Frame ${frame} is past the end of ${inPath}`);
  return outPath;
}
