// The report's plain-language glosses, built from the code they describe so the words cannot drift from it: what
// Prominence weighs (metrics/compute.ts), what a run cost (the receipt's rates), what SAM 3.1 and Muse Spark did, and
// which objects were not counted and why. Only verdict "lookalike" is a look-alike, as in the CSV's lookalikes_rejected
// column; "unclear" is an object Muse Spark could not tell, which is not counted either but is not a look-alike.
import { AREA_SATURATION, PROMINENCE_WEIGHTS, SMALL_AREA } from "@/lib/metrics/compute";
import type { VerifyVerdict } from "@/lib/types";
import accuracy from "@/lib/accuracy-data.json";
import { tenths } from "@/components/format";
import { pct as pct1, rowForRun, summarize, type AccuracyData } from "./accuracy-summary";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What the Prominence score weighs, from PROMINENCE_WEIGHTS, AREA_SATURATION and SMALL_AREA. The verdict reads only
 *  the contract terms (verdictOf) and no contract rule is about prominence, so it never moves pay or hold. */
export function prominenceGloss(): string {
  const w = PROMINENCE_WEIGHTS;
  return (
    `${pct(w.share)} share of the video, ${pct(w.area)} size (full marks at ${pct(AREA_SATURATION)} of the frame), ` +
    `${pct(w.centre)} how centered, ${pct(w.earliness)} how early; scaled down under ${pct(SMALL_AREA)} of the frame. ` +
    `For context only: it never changes pay or hold.`
  );
}

/** The rates behind every cost on a run receipt. They mirror SAM_USD_PER_FRAME (lib/meta/cost-guard.ts) and the
 *  per-call reserves in lib/pipeline/run.ts, which are server-only; report-words.test.ts fails if they drift apart. */
export const RECEIPT_RATES = { samPer1000Frames: 0.2, sparkPerCall: 0.02, transcribePerCall: 0.01 } as const;

/** "$0.115": a receipt amount, to the tenth of a cent (a fraction of a cent to four places). */
export function receiptUsd(usd: number): string {
  return `$${usd.toFixed(usd > 0 && usd < 0.01 ? 4 : 3)}`;
}

/**
 * The measured precision and recall (src/lib/accuracy-data.json), what each means, and whose labels they were scored
 * against, so the report says it without a trip to /accuracy. On a report that is one of the scored runs (the same run
 * id) whose count differs from its own labels, it also says what this report counted against them: the headline
 * figures alone would misdescribe George's report, which counted nothing.
 */
export function accuracyGloss(report?: { receipt?: { runId: string } }, data: AccuracyData = accuracy): string {
  const acc = summarize(data);
  const v = acc.verified;
  const l = data.labels;
  const against = !l?.clips
    ? ""
    : l.checkedByPerson >= l.clips
      ? ", against labels a person checked"
      : `, against labels drafted by two Claude vision passes (a person has checked ${l.checkedByPerson} of the ${l.clips})`;
  const own = rowForRun(data, report?.receipt?.runId);
  const ownLine =
    own && tenths(own.truthSec) !== tenths(own.predictedSec)
      ? ` This Reel is one of the ${acc.clips}: its labels mark ${tenths(own.truthSec)} s with the product, and this report counted ${tenths(own.predictedSec)} s.`
      : "";
  return (
    `Measured frame by frame on ${acc.clips} test Reels as delivered${against}: precision ${pct1(v.precision)}, recall ${pct1(v.recall)}. ` +
    `Precision is the share of the seconds Screen-Time counted that really showed the product; recall is the share of the seconds the ` +
    `product really showed that it counted.${ownLine}`
  );
}

/** What a report's Meta API cost is made of, in one line. Only SAM 3.1's amount follows the bill (frames processed,
 *  from the API's usage); Muse Spark and Voice Transcribe are billed by tokens and audio length, which the receipt does
 *  not record, so it counts the generous per-call reserve the budget holds for each (lib/pipeline/run.ts). */
export function costGloss(): string {
  const r = RECEIPT_RATES;
  return (
    `SAM 3.1 is billed per frame ($${r.samPer1000Frames.toFixed(2)} per 1,000); Muse Spark and Voice Transcribe count a fixed reserve per call ` +
    `($${r.sparkPerCall.toFixed(2)} / $${r.transcribePerCall.toFixed(2)}), above what they cost, so the total is an upper bound.`
  );
}

export type NotCountedKind = Exclude<VerifyVerdict, "match">;
export interface NotCounted {
  lookalikes: number;
  unclear: number;
}

/** The objects Muse Spark did not count, by why. */
export function notCounted(tracks: readonly { verdict: VerifyVerdict }[]): NotCounted {
  return {
    lookalikes: tracks.filter((t) => t.verdict === "lookalike").length,
    unclear: tracks.filter((t) => t.verdict === "unclear").length,
  };
}

/** The timeline lane for objects not counted: named for what is in it. */
export function notCountedLane(n: NotCounted): string {
  return n.lookalikes && n.unclear ? "Look-alike or unclear, not counted" : n.unclear ? "Unclear, not counted" : "Look-alike, not counted";
}

/** What the not-counted chip plays, for its label. */
export function notCountedPlay(n: NotCounted): string {
  return n.lookalikes && n.unclear ? "Play the first object not counted" : n.unclear ? "Play the unclear object" : "Play the rejected look-alike";
}

/** The timeline footnote for dashed red boxes; empty when there are none. */
export function notCountedNote(n: NotCounted): string {
  if (n.lookalikes && n.unclear) return "Dashed red was not counted: a look-alike Muse Spark rejected, or an object it could not make out.";
  if (n.unclear) return "Dashed red is an object Muse Spark could not make out, so it is not counted.";
  return n.lookalikes ? "Dashed red was rejected by Muse Spark as a look-alike." : "";
}

/**
 * The verdict header's model sentence, which is also where it says what the two models are: SAM 3.1 draws the boxes
 * (every object matching the search word, in every frame) and Muse Spark checks each one. Short enough that the
 * Pay/Hold heading stays on a phone's first screen.
 */
export function modelLine(o: { frames: number; prompt: string; brand: string; found: boolean; tracks: number; notCounted: NotCounted; photo: boolean }): string {
  if (!o.tracks) return `Meta’s SAM 3.1 searched all ${o.frames} frames for “${o.prompt}” and found nothing for Muse Spark to check.`;
  const { lookalikes: l, unclear: u } = o.notCounted;
  const sam = `Meta’s SAM 3.1 boxed every “${o.prompt}” in all ${o.frames} frames; Meta’s Muse Spark`;
  const left = [l && `rejected ${plural(l, "look-alike")}`, u && `left out ${plural(u, "unclear object")}`].filter(Boolean).join(" and ");
  if (o.found)
    return left
      ? `${sam} confirmed the ${o.brand} product and ${left}.`
      : `${sam} checked each against ${o.photo ? "your photo" : "the brief"} and confirmed the ${o.brand} product.`;
  // Nothing counted: say why, about the one object when it is a single unclear one.
  const why = !l && u === 1 ? `could not tell if the ${o.prompt} was the ${o.brand} product` : left || "checked each one";
  return `${sam} ${why}, so nothing counted.`;
}

/** The phone's verdict chip above the video: a take a re-cut replaced says so first (it decides nothing), then a
 *  manager's own call, then the recommendation. `word` is the verdict's decision word (Pay, Hold, Review). */
export function phoneChip(o: {
  word: string;
  fee: string;
  reason: string;
  creator: string;
  override?: { decision: "pay" | "hold" };
  replaced: boolean;
}): { kind: "replaced" | "override" | "verdict"; badge: string; text: string } {
  if (o.replaced) return { kind: "replaced", badge: "Replaced", text: `by ${o.creator}’s re-cut` };
  if (o.override)
    return { kind: "override", badge: `${o.override.decision === "pay" ? "Pay" : "Hold"}${o.fee}`, text: `Your call · Screen-Time said ${o.word.toLowerCase()}` };
  return { kind: "verdict", badge: `${o.word}${o.fee}`, text: o.reason };
}
