// What the new-campaign page promises about video length and waiting, computed from the run's own limits so the copy
// cannot drift from the code. Length is decided by the per-video spend cap, not by time: SAM 3.1 is billed per frame
// and its whole cost is reserved before tracking starts (lib/pipeline/run.ts), so a video longer than the cap covers
// stops at Track. Time is decided by the run route's maxDuration (RUN_MAX_SECONDS).
import { SAM_USD_PER_FRAME } from "@/lib/meta/cost-guard";
import { FPS } from "@/lib/types";

/** What a run reserves besides SAM 3.1, from the per-call reserves in lib/pipeline/run.ts: Muse Spark at $0.02 for
 *  three object checks, the contract terms and the disclosure read, and Voice Transcribe at $0.01. */
export const OTHER_CALLS_USD = 5 * 0.02 + 0.01;

/** SAM 3.1's cost for one second of video at the analysis frame rate. */
export const SAM_USD_PER_SECOND = SAM_USD_PER_FRAME * FPS;

/** The longest video, in seconds, whose SAM 3.1 reservation still leaves room for the other calls under the cap. */
export function maxVideoSeconds(maxUsdPerRun: number): number {
  return Math.max(0, (maxUsdPerRun - OTHER_CALLS_USD) / SAM_USD_PER_SECOND);
}

/** "about 2 minutes" (rounded down to the half minute), "about 45 seconds" under a minute. Never rounds up. */
export function aboutDuration(sec: number): string {
  if (sec < 60) return `about ${Math.max(5, Math.floor(sec / 5) * 5)} seconds`;
  const halves = Math.floor(sec / 30);
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (whole === 1 && !half) return "about 1 minute";
  return `about ${whole}${half ? "½" : ""} minutes`;
}

/** "$0.50". */
export const dollars = (usd: number) => `$${usd.toFixed(2)}`;
