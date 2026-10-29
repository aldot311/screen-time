// The live analysis view's data. A running video carries LiveProgress written by the pipeline; a finished report can
// be replayed by rebuilding the same shape from the report and revealing it one step at a time.
import { filmstripBoxes } from "./frames";
import type { LiveProgress, VideoReport } from "./types";

/** Everything a finished report says about how it was made, in the shape the run writes as it goes. */
export function liveFromReport(r: VideoReport): LiveProgress {
  const boxes = filmstripBoxes(r.detections ?? [], r.info.frameCount);
  const attempts = r.promptAttempts?.length ? r.promptAttempts : [{ prompt: r.prompt, objects: r.tracks.length, samFrames: r.cost.samFrames }];
  return {
    video: { frameCount: r.info.frameCount, durationSec: r.info.durationSec, width: r.info.width, height: r.info.height },
    // Only the search the report kept has its boxes; earlier searches are summarized.
    searches: attempts.map((a) => ({
      prompt: a.prompt,
      objects: a.objects,
      samFrames: a.samFrames,
      boxes: a.prompt === r.prompt ? boxes : [],
      ...("next" in a && a.next ? { next: a.next } : {}),
    })),
    checks: r.tracks.map((t) => ({ prompt: r.prompt, objectId: t.objectId, verdict: t.verdict, reason: t.reason })),
    heard: { mentions: r.metrics.mentions, disclosures: r.disclosure?.spoken ?? [] },
    measured: { secondsOnScreen: r.metrics.secondsOnScreen, shareOfVideo: r.metrics.shareOfVideo, firstSeenSec: r.metrics.firstSeenSec },
    terms: r.terms.map((t) => ({ text: t.term.text, pass: t.pass, detail: t.detail })),
  };
}

/** Which step each finding belongs to, in pipeline order. */
export const LIVE_KEYS = ["video", "searches", "checks", "heard", "measured", "terms"] as const;

/** The findings of steps 0..last only: what a replay shows once it has reached step `last`. */
export function liveUpTo(live: LiveProgress, last: number): LiveProgress {
  const out: LiveProgress = {};
  LIVE_KEYS.forEach((k, i) => {
    if (i <= last && live[k] !== undefined) Object.assign(out, { [k]: live[k] });
  });
  return out;
}
