// Pure parsers for ffmpeg's text output. ffprobe is not bundled, so `ffmpeg -i <file>` stderr is our probe.

export interface StreamSummary {
  width: number;
  height: number;
  hasAudio: boolean;
}

/** Reads the first video stream's size and whether any audio stream exists from `ffmpeg -i` stderr. */
export function parseStreams(stderr: string): StreamSummary {
  const videoLine = stderr.split("\n").find((line) => /Stream #\d+:\d+.*: Video: /.test(line));
  if (!videoLine) throw new Error("No video stream found");
  // The ", WxH" form avoids matching codec tags like "0x31637661".
  const size = videoLine.match(/, (\d+)x(\d+)[\s,]/);
  if (!size) throw new Error(`Could not read video size from: ${videoLine.trim()}`);
  return {
    width: Number(size[1]),
    height: Number(size[2]),
    hasAudio: /Stream #\d+:\d+.*: Audio: /.test(stderr),
  };
}

/** Last `frame=N` reported by `-progress pipe:1`. */
export function parseProgressFrames(stdout: string): number {
  const matches = [...stdout.matchAll(/^frame=(\d+)\s*$/gm)];
  if (matches.length === 0) throw new Error("ffmpeg reported no frame count");
  return Number(matches[matches.length - 1][1]);
}
