// What the landing page and /accuracy say about accuracy, computed from the measured data (src/lib/accuracy-data.json,
// written by `pnpm accuracy --labels data/labels/lacroix --json src/lib/accuracy-data.json`), so a re-measure or a
// change to the labels changes every figure, example and clip name on the site without anyone editing the copy.
// Nothing here invents a number: a sentence whose figure is missing is left out.
import { tenths } from "@/components/format";

export interface AccuracyRow {
  clip: string;
  target: string;
  truthSec: number;
  predictedSec: number;
  precision: number | null;
  recall: number | null;
}

export interface AccuracyScore {
  mode: string;
  rows: AccuracyRow[];
  precision: number | null;
  recall: number | null;
  f1: number | null;
  meanAbsErrorSec: number;
  falseSecondsOnEmptyClips: number;
}

export interface Interval {
  lo: number;
  hi: number;
}

export interface Intervals {
  precision: Interval | null;
  recall: Interval | null;
  f1: Interval | null;
}

export interface Scores {
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

/** Pay or hold on the on-screen term ("on screen at least N s in total"), as the labels imply it and as the app ran. */
export interface PayHoldRow {
  clip: string;
  target: string;
  needSec: number;
  labelledSec: number;
  countedSec: number;
  labelsPay: boolean;
  appPay: boolean;
}

/** What one scored run's own report says beside its count. */
export interface RunFacts {
  clip: string;
  target: string;
  runId?: string;
  startedAt?: string;
  costUsd?: number;
  notCounted: { lookalikes: number; unclear: number };
  /** The report's "worth a look" flags (lib/campaign/review.ts), word for word. */
  flags: string[];
}

export interface ObjectCheck {
  correct: number;
  lookalikesCounted: number;
  productsMissed: number;
  unclear?: number;
  interval: Interval;
}

/** The spoken terms as a person labelled them in /label, against what the app heard and read. */
export interface SpokenScores {
  labelled: number;
  of: number;
  brand: { agree: number; of: number; timed: number; meanAbsErrorSec: number | null; maxAbsErrorSec: number | null };
  disclosure: { agree: number; of: number; said: { agree: number; of: number }; shown: { agree: number; of: number } };
}

export interface AccuracyData {
  measuredAt: string;
  fps: number;
  scores: AccuracyScore[];
  // Written by scripts/accuracy.mts since the LaCroix set; older files lack them, and every sentence that needs one is
  // left out without it.
  set?: { clips: number; frames: number; positives: number; negatives: number };
  intervals?: { seed: number; resamples: number; sam: Intervals; verified: Intervals };
  withoutLookalikes?: { clips: string[]; sam: Scores; verified: Scores };
  payHold?: { agree: number; of: number; rows: PayHoldRow[] };
  objects?: {
    judged: number;
    unsure: number;
    hosted: ObjectCheck;
    samAlone: ObjectCheck;
    lookalikes?: { clip: string; target: string; objectId: number; note: string; counted: boolean }[];
  } | null;
  labels?: { clips: number; checkedByPerson: number; checkedBy: Record<string, string> };
  reports?: RunFacts[];
  spoken?: SpokenScores | null;
}

/** "97.7%" from 0.977, "n/a" when there was nothing to measure. */
export const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** "95%" for table cells, "–" when there was nothing to measure. */
export const pct0 = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);

/** "96.7–99.6%": a 95% interval, to the same tenth of a point as the figure it belongs to. */
export const pctRange = (i: Interval | null | undefined) => (i ? `${(i.lo * 100).toFixed(1)}–${(i.hi * 100).toFixed(1)}%` : null);

/** "62–100%": an interval around a small count, where tenths of a point would claim more than 12 objects can say. */
export const pctRange0 = (i: Interval) => `${Math.round(i.lo * 100)}–${Math.round(i.hi * 100)}%`;

/** The two scored modes: SAM 3.1 alone, and SAM 3.1 + Muse Spark (what the app reports). Looked up by mode, with the
 *  file's order (sam, then verified) as the fallback. */
export function scoresOf(d: AccuracyData): { sam: AccuracyScore; verified: AccuracyScore } {
  return {
    sam: d.scores.find((s) => s.mode === "sam") ?? d.scores[0],
    verified: d.scores.find((s) => s.mode === "verified") ?? d.scores[d.scores.length - 1],
  };
}

/** "lacroix-can" → "LaCroix can", "stanley-tumbler" → "Stanley tumbler": a target id read as a product. */
export function targetName(target: string): string {
  const words = target.replace(/[-_]+/g, " ").trim();
  const named = words.replace(/\blacroix\b/gi, "LaCroix");
  return named.charAt(0).toUpperCase() + named.slice(1);
}

/** "stock/stock01" → "stock01": the folder is not part of the clip's name. */
export const clipName = (clip: string) => clip.replace(/^.*\//, "");

/**
 * The measured LaCroix clips (data/labels/lacroix), the campaign video each one is, and who filmed it (two people
 * filmed two Reels each; Aldo, who built Screen-Time, filmed both of his). The scored runs (data/runs) are the runs
 * those campaign videos show, so a report and its row are the same run.
 */
const MEASURED: Record<string, { creator: string; person?: string; videoId: string; builder?: true; notToConfuse?: string; relabelledByClaude?: true }> = {
  "lc-1-george": { creator: "George", videoId: "george" },
  "lc-1-michael": { creator: "Michael", videoId: "michael", notToConfuse: "Michael K" },
  "lc-2-jamal": { creator: "Jamal", videoId: "jamal" },
  "lc-4-lana": { creator: "Lana", videoId: "lana" },
  "lc-6-michael": { creator: "Michael K", videoId: "6-michael-captioned-gk3bzd" },
  "lc-7a-ash": { creator: "Ash, first take", person: "Ash", videoId: "ash" },
  "lc-7b-ash": { creator: "Ash, re-cut", person: "Ash", videoId: "ash-recut" },
  "lc-8-peter": { creator: "Peter", videoId: "peter" },
  // Claude flipped this clip to "no product" at full resolution after the run (see its label notes).
  "lc-10-aldo": { creator: "Aldo", videoId: "aldo", builder: true, relabelledByClaude: true },
  "lc-11-jon": { creator: "Jon", videoId: "jon" },
  "lc-12-aldo": { creator: "Aldo 2", person: "Aldo", videoId: "aldo-2", builder: true },
};

/** A clip as people know it: the creator's name for a measured LaCroix Reel, else the clip's own name. */
export const clipLabel = (clip: string) => MEASURED[clipName(clip)]?.creator ?? clipName(clip);

/** The clip's name where two creators share a first name: "Michael (not Michael K)". */
export const clipLabelPlain = (clip: string) => {
  const other = MEASURED[clipName(clip)]?.notToConfuse;
  return other ? `${clipLabel(clip)} (not ${other})` : clipLabel(clip);
};

/** The campaign video a measured clip is, when there is one. */
export const clipVideoId = (clip: string) => MEASURED[clipName(clip)]?.videoId;

/** The measured clip a campaign video is: the reverse of clipVideoId, for building data/runs. */
export const videoClip = (videoId: string) => Object.entries(MEASURED).find(([, m]) => m.videoId === videoId)?.[0];

/** How many people filmed these clips, or null when a clip is not one we know the creator of. */
export function peopleIn(clips: string[]): number | null {
  const people = clips.map((c) => {
    const m = MEASURED[clipName(c)];
    return m ? (m.person ?? m.creator) : null;
  });
  return people.every((p) => p !== null) ? new Set(people).size : null;
}

/** A clip with nothing to find: a look-alike (SAM alone counted something there) or no product at all. */
export type ZeroKind = "lookalike" | "empty";

function zeroKind(row: AccuracyRow, sam: AccuracyScore): ZeroKind | null {
  if (row.truthSec > 0) return null;
  const alone = sam.rows.find((r) => r.clip === row.clip && r.target === row.target);
  return (alone?.predictedSec ?? 0) > 0 ? "lookalike" : "empty";
}

export interface Summary {
  measuredAt: string;
  fps: number;
  targets: number;
  clips: number;
  /** Clips with more than one product checked, each on its own. */
  multiProductClips: number;
  stockClips: number;
  lookalikeClips: number;
  emptyClips: number;
  sam: AccuracyScore;
  verified: AccuracyScore;
}

export function summarize(d: AccuracyData): Summary {
  const { sam, verified } = scoresOf(d);
  const perClip = new Map<string, number>();
  for (const r of verified.rows) perClip.set(r.clip, (perClip.get(r.clip) ?? 0) + 1);
  const kinds = verified.rows.map((r) => zeroKind(r, sam));
  return {
    measuredAt: d.measuredAt,
    fps: d.fps,
    targets: verified.rows.length,
    clips: perClip.size,
    multiProductClips: [...perClip.values()].filter((n) => n > 1).length,
    stockClips: [...perClip.keys()].filter((c) => c.startsWith("stock/")).length,
    lookalikeClips: kinds.filter((k) => k === "lookalike").length,
    emptyClips: kinds.filter((k) => k === "empty").length,
    sam,
    verified,
  };
}

/** Seconds counted that the labels mark as not on screen, and real seconds that were not counted. */
export function missSeconds(r: AccuracyRow): { extraSec: number; missedSec: number } {
  return {
    extraSec: r.precision === null ? 0 : r.predictedSec * (1 - r.precision),
    missedSec: r.recall === null ? 0 : r.truthSec * (1 - r.recall),
  };
}

/** The row with the lowest precision and the (other) row with the lowest recall, when either is below 100%. */
export function weakest(rows: AccuracyRow[]): { precision?: AccuracyRow; recall?: AccuracyRow } {
  const low = (key: "precision" | "recall", skip?: AccuracyRow) =>
    rows
      .filter((r) => r !== skip && r[key] !== null && (r[key] as number) < 1)
      .reduce<AccuracyRow | undefined>((min, r) => (!min || (r[key] as number) < (min[key] as number) ? r : min), undefined);
  const precision = low("precision");
  return { precision, recall: low("recall", precision) };
}

export interface SampleRow extends AccuracyRow {
  weak?: "precision" | "recall";
  zero?: ZeroKind;
  note?: string;
}

/**
 * A short, honest sample of the rows for the landing page: the clearest checks, then the weakest precision and the
 * weakest recall on purpose, then the clips that must count 0 s (a look-alike, no product). At most `n` rows.
 */
export function sampleRows(d: AccuracyData, n = 7): SampleRow[] {
  const { sam, verified } = scoresOf(d);
  const rows = verified.rows;
  const perClip = new Map<string, number>();
  for (const r of rows) perClip.set(r.clip, (perClip.get(r.clip) ?? 0) + 1);
  const weak = weakest(rows);
  const zeros = rows.filter((r) => r.truthSec === 0).slice(0, 2);
  // A look-alike counted by mistake is both a must-be-0 clip and the weakest precision: list it once.
  const picked = [...new Set([weak.precision, weak.recall, ...zeros])].filter((r): r is AccuracyRow => r !== undefined);
  const fill = rows
    .filter((r) => !picked.includes(r))
    .sort((a, b) => b.truthSec - a.truthSec)
    .slice(0, Math.max(0, n - picked.length));
  return [...fill, ...picked].slice(0, n).map((r) => {
    const zero = zeroKind(r, sam) ?? undefined;
    const note =
      zero === "lookalike"
        ? "Only a look-alike in shot, must count 0"
        : zero === "empty"
          ? "No product in the video, must count 0"
          : (perClip.get(r.clip) ?? 0) > 1
            ? "One of two products in the same shot"
            : r.truthSec > 0 && r.predictedSec === 0 && (runFacts(d, r)?.notCounted.unclear ?? 0) > 0
              ? "Muse Spark could not confirm the product, so none was counted; the report flags it"
              : MEASURED[clipName(r.clip)]?.notToConfuse
                ? `Not ${MEASURED[clipName(r.clip)].notToConfuse}’s Reel`
                : undefined;
    return { ...r, weak: r === weak.precision ? "precision" : r === weak.recall ? "recall" : undefined, zero, note };
  });
}

const same = (a: { clip: string; target: string }, b: { clip: string; target: string }) => a.clip === b.clip && a.target === b.target;

/** The facts a run's own report gives beside a row, when the data has them. */
export const runFacts = (d: AccuracyData, r: { clip: string; target: string }) => d.reports?.find((f) => same(f, r));

/** The row a report's own run scored, found by its run id, so only that exact run is described by it. */
export function rowForRun(d: AccuracyData, runId: string | undefined): AccuracyRow | undefined {
  const facts = runId ? d.reports?.find((f) => f.runId === runId) : undefined;
  return facts && scoresOf(d).verified.rows.find((r) => same(r, facts));
}

/**
 * Who made the labels, from the label files: drafted by two Claude vision passes at 5 frames a second, and how many
 * clips a person has checked frame by frame. Only when every clip has been checked does it say the labels were.
 */
export function labelProvenance(d: AccuracyData): { line: string; resolution: string | null; allChecked: boolean } | null {
  if (!d.labels?.clips) return null;
  const { clips, checkedByPerson: n } = d.labels;
  if (n >= clips) {
    return {
      line: `Labels: drafted by two independent Claude vision passes at 5 frames a second, then checked frame by frame by a person on all ${clips} clips.`,
      resolution: null,
      allChecked: true,
    };
  }
  return {
    line: `Labels: drafted by two independent Claude vision passes at 5 frames a second (each sample stands for 3 frames); checked frame by frame by a person: ${n} of ${clips} clips.`,
    resolution: `${n ? `On the ${clips - n} clips no person has checked yet, labels` : "Labels"} were judged on every 3rd frame, so a boundary can be off by 2 frames (${tenthsOf(2 / (d.fps || 15))} s) from the sampling alone.`,
    allChecked: false,
  };
}

/** 0.1333 → "0.13": a short duration where tenths would read 0.1. */
const tenthsOf = (sec: number) => (Math.floor(sec * 100 + 1e-6) / 100).toFixed(2);

/** A clip whose count Muse Spark changed: SAM 3.1 alone counted `samSec`, the app `sparkSec`. */
export interface SparkChange {
  clip: string;
  target: string;
  truthSec: number;
  samSec: number;
  sparkSec: number;
  /** "lookalike": nothing to find, and Spark rejected what SAM tracked; "unconfirmed": Spark could not tell what a real
   *  product was (unclear), so it was not counted; "other": any other change. */
  kind: "lookalike" | "unconfirmed" | "other";
}

/** Every row where the second model changed the count, and how, from the two scored modes and the run's report. */
export function sparkChanges(d: AccuracyData): SparkChange[] {
  const { sam, verified } = scoresOf(d);
  return verified.rows.flatMap((v) => {
    const s = sam.rows.find((r) => same(r, v));
    if (!s || s.predictedSec === v.predictedSec) return [];
    const unclear = runFacts(d, v)?.notCounted.unclear ?? 0;
    const kind = v.truthSec === 0 ? "lookalike" : unclear > 0 && v.predictedSec < s.predictedSec ? "unconfirmed" : "other";
    return [{ clip: v.clip, target: v.target, truthSec: v.truthSec, samSec: s.predictedSec, sparkSec: v.predictedSec, kind }];
  });
}

const payWord = (pay: boolean) => (pay ? "pay" : "hold");

/** "1,931 frames with the product in 2,800; 11 Reels; 9 people": how big the measured set is. */
export function setLine(d: AccuracyData): string | null {
  if (!d.set) return null;
  const n = (x: number) => x.toLocaleString("en-US");
  const people = peopleIn(scoresOf(d).verified.rows.map((r) => r.clip));
  return [`${n(d.set.positives)} frames with the product in ${n(d.set.frames)}`, `${d.set.clips} Reels`, people ? `${people} people` : null]
    .filter(Boolean)
    .join("; ");
}

/**
 * What Muse Spark changed, Reel by Reel, in sentences: which counts it changed and why, what the scores are without the
 * look-alike Reels, and the object check. Every figure comes from the data, so a re-measure rewrites the story.
 */
export function sparkStory(d: AccuracyData): string[] {
  const { sam, verified } = scoresOf(d);
  const clips = new Set(verified.rows.map((r) => r.clip)).size;
  const changes = sparkChanges(d);
  const out = [changes.length ? `Muse Spark changed the count on ${changes.length} of the ${clips} Reels.` : "Muse Spark changed no Reel's count."];
  for (const c of changes) {
    const who = `${clipLabel(c.clip)}${clipLabel(c.clip).endsWith("s") ? "’" : "’s"} Reel`;
    const builder = MEASURED[clipName(c.clip)]?.builder ? ", which the builder filmed," : "";
    if (c.kind === "lookalike") {
      const what = d.objects?.lookalikes?.find((o) => o.clip === c.clip && o.target === c.target)?.note;
      const fixed = MEASURED[clipName(c.clip)]?.relabelledByClaude
        ? " Claude corrected that clip’s label at full resolution after the run: both drafting passes had marked the look-alike as the product."
        : "";
      out.push(
        `On ${who}${builder} only a look-alike is in shot${what ? `: ${what.replace(/\s*\((.*)\)$/, ", $1")}` : ""}. SAM 3.1 alone counted ${tenths(c.samSec)} s of it; Muse Spark rejected it, so 0 s.${fixed}`,
      );
    } else if (c.kind === "unconfirmed") {
      const ph = d.payHold?.rows.find((r) => same(r, c));
      const flagged = (runFacts(d, c)?.flags.length ?? 0) > 0;
      const after = [ph && !ph.appPay ? "the report holds the fee" : null, flagged ? "flags it for a person to look at" : null].filter(Boolean).join(" and ");
      out.push(
        `On ${who} Muse Spark could not confirm the ${targetName(c.target).replace(/^\S+\s/, "").toLowerCase() || "product"} SAM 3.1 tracked for ${tenths(c.samSec)} s, so it counted ${tenths(c.sparkSec)} s against ${tenths(c.truthSec)} s labelled${after ? `; ${after}` : ""}.`,
      );
    } else {
      out.push(`On ${who}: ${tenths(c.samSec)} s with SAM 3.1 alone, ${tenths(c.sparkSec)} s with Muse Spark, against ${tenths(c.truthSec)} s labelled.`);
    }
  }
  if (changes.length && changes.length < clips) out.push(`On the other ${clips - changes.length} the count is the same either way.`);
  const w = d.withoutLookalikes;
  if (w?.clips.length && w.sam.precision !== null && w.verified.precision !== null && sam.precision !== null && verified.precision !== null) {
    const gain = verified.precision - sam.precision;
    const share = gain > 0 ? (w.sam.precision - sam.precision) / gain : 0;
    out.push(
      `Without the look-alike ${w.clips.length === 1 ? "Reel" : "Reels"}, SAM 3.1 alone scores ${pct(w.sam.precision)} precision and ${pct(w.sam.recall)} recall; ` +
        `with Muse Spark, ${pct(w.verified.precision)} and ${pct(w.verified.recall)}` +
        (share >= 0.999 ? `: per frame, all of the precision gain is ${w.clips.length === 1 ? "that Reel" : "those Reels"}.` : share >= 0.8 ? `: per frame, nearly all of the precision gain is ${w.clips.length === 1 ? "that Reel" : "those Reels"}.` : "."),
    );
  }
  const o = d.objects;
  if (o?.lookalikes?.length) {
    const total = o.lookalikes.length;
    const rejected = o.lookalikes.filter((l) => !l.counted).length;
    out.push(
      rejected === total
        ? `Object by object, Muse Spark rejected ${total === 1 ? "the look-alike" : total === 2 ? "both look-alikes" : `all ${total} look-alikes`} that SAM 3.1 alone counts (${rejected} of ${total}).`
        : `Object by object, Muse Spark rejected ${rejected} of the ${total} look-alikes that SAM 3.1 alone counts.`,
    );
  }
  return out;
}

export interface ObjectRow {
  name: string;
  correct: number;
  of: number;
  interval: Interval | null;
  lookalikes: number;
  missed: number;
  /** Why a product was missed, when the data says. */
  missedNote?: string;
}

/** The object-by-object table: hosted Muse Spark as it ran on these Reels and SAM 3.1 alone, from the scored runs. */
export function objectRows(d: AccuracyData, hostedModel: string): ObjectRow[] {
  const o = d.objects;
  if (!o) return [];
  return [
    {
      name: `Muse Spark ${hostedModel.replace(/^muse-spark-/, "")} (hosted)`,
      correct: o.hosted.correct,
      of: o.judged,
      interval: o.hosted.interval,
      lookalikes: o.hosted.lookalikesCounted,
      missed: o.hosted.productsMissed,
      missedNote: o.hosted.unclear ? `${o.hosted.unclear === o.hosted.productsMissed ? "" : `${o.hosted.unclear} `}unclear` : undefined,
    },
    {
      name: "SAM 3.1 alone (every tracked object counts)",
      correct: o.samAlone.correct,
      of: o.judged,
      interval: o.samAlone.interval,
      lookalikes: o.samAlone.lookalikesCounted,
      missed: o.samAlone.productsMissed,
    },
  ];
}

/** "9 of 11": pay or hold on the on-screen term, labels against the app, with the Reels where they differ. */
export function payHoldSummary(d: AccuracyData): { line: string; differ: string[] } | null {
  const p = d.payHold;
  if (!p?.of) return null;
  const needs = [...new Set(p.rows.map((r) => r.needSec))];
  const term = needs.length === 1 ? `the on-screen term (at least ${tenths(needs[0])} s in total)` : "each Reel's on-screen term";
  const differ = p.rows
    .filter((r) => r.labelsPay !== r.appPay)
    .map((r) => `${clipLabelPlain(r.clip)}: ${tenths(r.labelledSec)} s labelled, ${tenths(r.countedSec)} s counted, so the labels say ${payWord(r.labelsPay)} and the report says ${payWord(r.appPay)}`);
  return { line: `Pay or hold on ${term} agrees with the labels on ${p.agree} of ${p.of} Reels.`, differ };
}

export interface WrongCard {
  key: "precision" | "recall";
  title: string;
  clip: string;
  what: string;
  why: string;
}

/** The two misses that matter most, from the data itself: the clip that over-counted most and the one that
 *  under-counted most, with what the run's own report did about it. Worded from their own figures, so a re-measure or
 *  a corrected label rewrites them. */
export function whereWrong(d: AccuracyData): WrongCard[] {
  const { verified } = scoresOf(d);
  const weak = weakest(verified.rows);
  const name = (r: AccuracyRow) => `${clipLabelPlain(r.clip)} · ${targetName(r.target)}`;
  const counts = (r: AccuracyRow) => `labelled ${tenths(r.truthSec)} s, counted ${tenths(r.predictedSec)} s`;
  const consequence = (r: AccuracyRow) => {
    const ph = d.payHold?.rows.find((p) => same(p, r));
    const facts = runFacts(d, r);
    const parts: string[] = [];
    if (r.predictedSec === 0 && r.truthSec > 0 && (facts?.notCounted.unclear ?? 0) > 0)
      parts.push("Muse Spark could not confirm that the tracked object was the product (it called it unclear), so none of it was counted.");
    if (ph && ph.labelsPay !== ph.appPay)
      parts.push(`The contract needs ${tenths(ph.needSec)} s: by the labels this Reel should ${payWord(ph.labelsPay)}, and the report says ${payWord(ph.appPay)}.`);
    if (facts?.flags.length) parts.push("The report flags it for a person to look at before paying or holding.");
    return parts.length ? ` ${parts.join(" ")}` : "";
  };
  const cards: (WrongCard | undefined)[] = [
    weak.precision && {
      key: "precision",
      title: weak.precision.precision === 0 ? "Counted only what was not there" : "Counted more than was there",
      clip: name(weak.precision),
      what: `Precision ${pct(weak.precision.precision)}: ${tenths(missSeconds(weak.precision).extraSec)} s counted that the labels mark as not on screen (${counts(weak.precision)}).`,
      why: `The lowest precision in the test set. Over-counting is the costly error: it would pay for screen time the brand did not get.${consequence(weak.precision)}`,
    },
    weak.recall && {
      key: "recall",
      title: weak.recall.recall === 0 ? "Missed all of it" : "Missed some of it",
      clip: name(weak.recall),
      what: `Recall ${pct(weak.recall.recall)}: ${tenths(missSeconds(weak.recall).missedSec)} s of real screen time not counted (${counts(weak.recall)}).`,
      why: `The lowest recall in the test set. Here the report under-counts, so the brand sees less screen time than it got, not more.${consequence(weak.recall)}`,
    },
  ];
  return cards.filter((c): c is WrongCard => !!c);
}

/** The spoken terms, only once a person has labelled them on every scored clip; until then, null. */
export function spokenSummary(d: AccuracyData): string[] | null {
  const s = d.spoken;
  if (!s || !s.of || s.labelled < s.of || (d.set && s.of < d.set.clips)) return null;
  const err = s.brand.meanAbsErrorSec;
  return [
    `Brand said out loud: the app agrees with the person on ${s.brand.agree} of ${s.brand.of} Reels` +
      (err !== null ? `; where both heard it, the first mention was ${err.toFixed(1)} s off on average (at most ${(s.brand.maxAbsErrorSec ?? err).toFixed(1)} s).` : "."),
    `Ad disclosure: the app agrees with the person on ${s.disclosure.agree} of ${s.disclosure.of} Reels (said aloud ${s.disclosure.said.agree} of ${s.disclosure.said.of}, shown on screen ${s.disclosure.shown.agree} of ${s.disclosure.shown.of}).`,
  ];
}

/**
 * The contract-reading eval (scripts/contract-eval.mts writes src/lib/contract-eval-data.json, null until it has
 * run). Each plain-English clause is read `runsPerCase` times; totals count readings, so a clause read three times
 * adds three. `expected` clauses have one right rule; `mustRefuse` clauses cannot be checked from the video, and the
 * right answer is no rule, so a person checks them.
 */
export interface ContractEval {
  measuredAt: string;
  model: string;
  runsPerCase: number;
  expected: { total: number; exact: number; safeMiss: number; misread: number };
  mustRefuse: { total: number; refused: number; passedThrough: number };
  live: { total: number; exact: number };
  costUsd: number;
  rows: unknown[];
}

/** The eval's figures as the page says them, or null when it has not run. */
export function contractEvalSummary(e: ContractEval | null): { headline: string; lines: string[]; footnote: string } | null {
  if (!e || !e.runsPerCase || !e.expected.total) return null;
  // Counts are per clause, each scored by its worst reading out of runsPerCase.
  const clauses = e.rows?.length || e.expected.total + e.mustRefuse.total;
  return {
    headline: `${clauses} plain-English clauses, each read ${e.runsPerCase} times: ${e.expected.exact} of the ${e.expected.total} with one right reading were read exactly every time.`,
    lines: [
      `Clauses with one right reading: ${e.expected.exact} of ${e.expected.total} exact in every reading, ${e.expected.misread} misread (a wrong rule), ${e.expected.safeMiss} left for a person.`,
      ...(e.mustRefuse.total
        ? [`Clauses the video cannot settle: ${e.mustRefuse.refused} of ${e.mustRefuse.total} refused in every reading, so a person checks them; turned into a rule ${e.mustRefuse.passedThrough === 1 ? "once" : `${e.mustRefuse.passedThrough} times`}.`]
        : []),
      ...(e.live.total ? [`The terms of this site's campaigns: ${e.live.exact} of ${e.live.total} exact in every reading.`] : []),
    ],
    footnote: `${e.model}, measured ${e.measuredAt}, $${e.costUsd.toFixed(2)} for the whole eval.`,
  };
}
