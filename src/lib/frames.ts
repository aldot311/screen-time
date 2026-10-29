// Frame picks shared by the pipeline and the browser (no Node imports).

/** Frame indices spread evenly over the video, distinct (a very short clip would otherwise repeat one). */
export function evenFrames(frameCount: number, n: number): number[] {
  return [...new Set(Array.from({ length: n }, (_, i) => Math.floor(((i + 0.5) * frameCount) / n)))];
}

/** Frames on the live analysis filmstrip. */
export const FILMSTRIP_FRAMES = 8;

/** The filmstrip's frames: FILMSTRIP_FRAMES spread over the video. */
export const filmstripFrames = (frameCount: number) => evenFrames(frameCount, FILMSTRIP_FRAMES);

/** The boxes SAM drew on exactly the filmstrip's frames. */
export function filmstripBoxes<T extends { frame: number }>(detections: T[], frameCount: number): T[] {
  const frames = new Set(filmstripFrames(frameCount));
  return detections.filter((d) => frames.has(d.frame));
}
