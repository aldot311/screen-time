import { describe, expect, it } from "vitest";
import { parseProgressFrames, parseStreams } from "./parse";
import { paddedCrop, scaleFilter, seekSeconds } from "./index";

const STDERR_AV = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':
  Duration: 00:00:02.00, start: 0.000000, bitrate: 120 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 540x960 [SAR 1:1 DAR 9:16], 52 kb/s, 15 fps, 15 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)
At least one output file must be specified`;

describe("parseStreams", () => {
  it("reads size and audio presence, ignoring codec tags", () => {
    expect(parseStreams(STDERR_AV)).toEqual({ width: 540, height: 960, hasAudio: true });
  });

  it("reports no audio when there is no audio stream", () => {
    const videoOnly = STDERR_AV.split("\n").filter((l) => !l.includes("Audio:")).join("\n");
    expect(parseStreams(videoOnly).hasAudio).toBe(false);
  });

  it("throws without a video stream", () => {
    expect(() => parseStreams("Stream #0:0: Audio: aac, 44100 Hz")).toThrow(/No video stream/);
  });
});

describe("parseProgressFrames", () => {
  it("takes the last frame= line", () => {
    expect(parseProgressFrames("frame=10\nprogress=continue\nframe=30\nprogress=end\n")).toBe(30);
  });

  it("throws when no frame count is present", () => {
    expect(() => parseProgressFrames("progress=end\n")).toThrow();
  });
});

describe("paddedCrop", () => {
  it("pads by a fraction of box size and keeps inclusive coordinates", () => {
    expect(paddedCrop({ x1: 100, y1: 100, x2: 199, y2: 149 }, 0.1, 960, 540)).toEqual({ x: 90, y: 95, w: 120, h: 60 });
  });

  it("clamps to the frame", () => {
    expect(paddedCrop({ x1: 0, y1: 0, x2: 539, y2: 959 }, 0.5, 540, 960)).toEqual({ x: 0, y: 0, w: 540, h: 960 });
  });

  it("rejects a box outside the frame", () => {
    expect(() => paddedCrop({ x1: 2000, y1: 0, x2: 2100, y2: 10 }, 0, 960, 540)).toThrow();
  });
});

describe("helpers", () => {
  it("seeks half a frame early and never below zero", () => {
    expect(seekSeconds(0)).toBe("0.000000");
    expect(seekSeconds(15)).toBe((14.5 / 15).toFixed(6));
  });

  it("scale filter caps the longest edge", () => {
    expect(scaleFilter(960)).toContain("min(960,max(iw,ih))");
  });
});
