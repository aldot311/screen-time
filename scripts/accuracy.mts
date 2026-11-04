// Compare pipeline reports (<dir>/<target>/<clip>/report.json) with labels (data/labels/<id>.json), frame by frame.
// Usage: pnpm accuracy [dir] [--json path] [--labels data/labels/lacroix] [--measured-at YYYY-MM-DD]
//
// dir defaults to data/runs: the committed reports of the runs the site shows, trimmed to what scoring needs
// (scripts/export-runs.mts). Without data/runs it falls back to data/out, where local CLI runs land (gitignored).
//
// Two ablation rows come from the same runs, with no new model calls:
// - "SAM 3.1 alone": every frame where SAM drew a box for the prompt, before Muse Spark judged any object (so a
//   look-alike counts as the product);
// - "SAM 3.1 + Muse Spark": only the objects Muse Spark confirmed as the brand's product (what the app reports).
// --json writes both, per target and overall, for the in-app accuracy page, with what the page says around them: the
// size of the set, 95% intervals from resampling whole clips, the scores without the look-alike clips, pay or hold on
// the on-screen term, the object check (objects.json), how many label files a person checked, and the spoken terms
// once a person has labelled them. measuredAt is the day of the newest run scored, so a re-score never re-dates it.
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reviewFlags } from "@/lib/campaign/review";
import { clipBootstrap, clopperPearson, scoresOf, type FrameCounts } from "@/lib/metrics/intervals";
import { FPS, type VideoReport } from "@/lib/types";

const args = process.argv.slice(2);
const FLAGS = ["--json", "--labels", "--measured-at"];
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const jsonPath = flag("--json");
// --labels scores one labelled set (the LaCroix Reels live in data/labels/lacroix); the default reads every set.
const labelsDir = flag("--labels") ?? "data/labels";
const measuredAtFlag = flag("--measured-at");
const outDir = args.find((a, i) => !a.startsWith("--") && !FLAGS.includes(args[i - 1])) ?? (existsSync("data/runs") ? "data/runs" : "data/out");
if (measuredAtFlag !== null && !/^\d{4}-\d{2}-\d{2}$/.test(measuredAtFlag)) {
  console.error(`--measured-at takes a date like 2026-11-03, not "${measuredAtFlag}"`);
  process.exit(1);
}

/** The clip-clustered bootstrap behind the 95% intervals: fixed, so a re-score gives the same intervals. */
const BOOTSTRAP = { seed: 20261103, resamples: 100_000 };

interface Target {
  name: string;
  ranges: [number, number][];
}

/** How the clip says it is an ad, as a person heard and saw it: "shown" is on-screen text that states it is an ad;
 *  "implied" is only something like "even if it wasn't an ad", which is not a disclosure. */
type SpokenDisclosure = "said" | "shown" | "both" | "implied" | "none";

interface Labels {
  id: string;
  checkedBy?: string;
  targets: Target[];
  // Spoken terms, set by a person in /label: an independent check of Voice Transcribe and the #ad reader.
  saidBrand?: boolean;
  saidBrandAtSec?: number | null;
  disclosure?: SpokenDisclosure;
}

interface ObjectTruth {
  clip: string;
  target: string;
  objectId: number;
  truth: "product" | "other" | "unsure";
  note?: string;
}

type Mode = "sam" | "verified";

function labelFrames(l: Target): Set<number> {
  const s = new Set<number>();
  for (const [a, b] of l.ranges) for (let f = a; f <= b; f++) s.add(f);
  return s;
}

// Score the frames the pipeline actually detected. Segments also cover bridged gaps, so they are only a
// fallback for reports written before visibleFrames existed.
function reportFrames(r: VideoReport, name: string, mode: Mode): Set<number> {
  if (mode === "sam") return new Set((r.detections ?? []).map((d) => d.frame));
  if (Array.isArray(r.metrics.visibleFrames)) return new Set(r.metrics.visibleFrames);
  console.warn(`warning: ${name} report has no visibleFrames; scoring segments, which count bridged gaps as predictions`);
  const s = new Set<number>();
  for (const seg of r.metrics.segments) {
    for (let f = Math.round(seg.startSec * FPS); f < Math.round(seg.endSec * FPS); f++) s.add(f);
  }
  return s;
}

export interface Row {
  clip: string;
  target: string;
  truthSec: number;
  predictedSec: number;
  precision: number | null;
  recall: number | null;
}

export interface Score {
  mode: Mode;
  rows: Row[];
  precision: number | null;
  recall: number | null;
  f1: number | null;
  /** Mean |predicted − truth| seconds per target: how far off the number a brand would see is. */
  meanAbsErrorSec: number;
  /** Seconds counted on clips whose product is not in them (the look-alike and the empty clip). */
  falseSecondsOnEmptyClips: number;
}

// Clip labels, object truth (objects.json) and the /label tool's checklist (checklist.json) share the folder; a clip
// label is a file with targets. Sorted, so rows and the bootstrap's draws are the same on every file system.
const docs: unknown[] = await Promise.all(
  (await readdir(labelsDir, { recursive: true }))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map(async (f) => JSON.parse(await readFile(join(labelsDir, f), "utf8"))),
);
const labelled = docs.filter((d): d is Labels => Array.isArray((d as Labels | null)?.targets));
const objectTruth = docs.flatMap((d) => ((d as { objects?: unknown } | null)?.objects as ObjectTruth[] | undefined) ?? []);

/** One labelled product in one clip, with the report of the run that measured it. */
interface Case {
  labels: Labels;
  target: Target;
  report: VideoReport;
  truth: Set<number>;
}

const cases: Case[] = [];
for (const labels of labelled) {
  for (const target of labels.targets) {
    try {
      const report: VideoReport = JSON.parse(await readFile(join(outDir, target.name, labels.id, "report.json"), "utf8"));
      cases.push({ labels, target, report, truth: labelFrames(target) });
    } catch {
      // No run for this label yet.
    }
  }
}

function score(mode: Mode): { score: Score; perClip: Map<string, FrameCounts>; perCase: FrameCounts[] } {
  let tp = 0, fp = 0, fn = 0, absErr = 0, emptySec = 0;
  const rows: Row[] = [];
  const perClip = new Map<string, FrameCounts>();
  const perCase: FrameCounts[] = [];
  for (const { labels, target, report, truth } of cases) {
    const pred = reportFrames(report, `${labels.id}:${target.name}`, mode);
    const t = [...pred].filter((f) => truth.has(f)).length;
    const c = { tp: t, fp: pred.size - t, fn: [...truth].filter((f) => !pred.has(f)).length };
    perCase.push(c);
    // The bootstrap resamples clips, so a clip with two products counts as one draw.
    const clip = perClip.get(labels.id) ?? { tp: 0, fp: 0, fn: 0 };
    perClip.set(labels.id, { tp: clip.tp + c.tp, fp: clip.fp + c.fp, fn: clip.fn + c.fn });
    tp += c.tp;
    fp += c.fp;
    fn += c.fn;
    absErr += Math.abs(pred.size - truth.size) / FPS;
    if (!truth.size) emptySec += pred.size / FPS;
    rows.push({
      clip: labels.id,
      target: target.name,
      truthSec: truth.size / FPS,
      predictedSec: pred.size / FPS,
      // Precision is undefined when nothing was predicted; recall on a clip with nothing to find.
      precision: pred.size ? t / pred.size : null,
      recall: truth.size ? t / truth.size : null,
    });
  }
  const { precision, recall, f1 } = scoresOf({ tp, fp, fn });
  const n = cases.length;
  return { score: { mode, rows, precision, recall, f1, meanAbsErrorSec: n ? absErr / n : 0, falseSecondsOnEmptyClips: emptySec }, perClip, perCase };
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const range = (i: { lo: number; hi: number } | null) => (i ? `${(i.lo * 100).toFixed(1)}–${(i.hi * 100).toFixed(1)}%` : "n/a");
const sam = score("sam");
const verified = score("verified");
const scores = [sam.score, verified.score];
if (!verified.score.rows.length) {
  console.log("No labelled frames to score yet (need data/labels/<id>.json and a matching report).");
  process.exit(0);
}

// The set, from the reports' frame counts: every frame is either labelled with the product or without it.
const clipIds = [...new Set(cases.map((c) => c.labels.id))];
// A clip's frames are counted once even when it has two products; without every frame count the set is not stated.
const frameCounts = [...new Map(cases.map((c) => [c.labels.id, c.report.info?.frameCount])).values()];
const frames = frameCounts.every((n): n is number => typeof n === "number") ? frameCounts.reduce((a, b) => a + b, 0) : null;
const positives = cases.reduce((n, c) => n + c.truth.size, 0);
const set = frames === null ? null : { clips: clipIds.length, frames, positives, negatives: frames - positives };

const intervals = {
  ...BOOTSTRAP,
  sam: clipBootstrap([...sam.perClip.values()], BOOTSTRAP),
  verified: clipBootstrap([...verified.perClip.values()], BOOTSTRAP),
};

// The same scores without the look-alike clips (no product labelled, but SAM alone counted something): what the
// second model adds on every other clip.
const lookalike = cases.map((c, i) => c.truth.size === 0 && sam.perCase[i].tp + sam.perCase[i].fp > 0);
const without = (perCase: FrameCounts[]) =>
  scoresOf(perCase.filter((_, i) => !lookalike[i]).reduce((s, c) => ({ tp: s.tp + c.tp, fp: s.fp + c.fp, fn: s.fn + c.fn }), { tp: 0, fp: 0, fn: 0 }));
const withoutLookalikes = {
  clips: [...new Set(cases.filter((_, i) => lookalike[i]).map((c) => c.labels.id))],
  sam: without(sam.perCase),
  verified: without(verified.perCase),
};

// What each run's own report says beside the count: the objects Muse Spark did not count, and the "worth a look" flags
// a manager sees (lib/campaign/review.ts).
const reports = cases.map(({ labels, target, report }) => ({
  clip: labels.id,
  target: target.name,
  ...(report.receipt ? { runId: report.receipt.runId, startedAt: report.receipt.startedAt } : {}),
  ...(report.cost ? { costUsd: report.cost.usd } : {}),
  notCounted: {
    lookalikes: (report.tracks ?? []).filter((t) => t.verdict === "lookalike").length,
    unclear: (report.tracks ?? []).filter((t) => t.verdict === "unclear").length,
  },
  flags: report.terms ? reviewFlags(report) : [],
}));

// Pay or hold on the on-screen term ("on screen at least N seconds in total"), as the labels imply it and as the app
// decided it, with the contract checker's tolerance (rules.ts) for sums of 1/15 s.
const payHoldRows = cases.flatMap(({ labels, target, report, truth }, i) => {
  const term = (report.terms ?? []).find((t) => t.term.rule?.kind === "min_seconds_total" && t.pass !== null);
  if (term?.term.rule?.kind !== "min_seconds_total") return [];
  const needSec = term.term.rule.seconds;
  const labelledSec = truth.size / FPS;
  return [
    {
      clip: labels.id,
      target: target.name,
      needSec,
      labelledSec,
      countedSec: verified.score.rows[i].predictedSec,
      labelsPay: labelledSec + 1e-6 >= needSec,
      appPay: term.pass === true,
    },
  ];
});
const payHold = { agree: payHoldRows.filter((r) => r.labelsPay === r.appPay).length, of: payHoldRows.length, rows: payHoldRows };

// Object by object (objects.json): hosted Muse Spark as it ran on these reports, and SAM 3.1 alone, where every
// tracked object counts. An object the run did not track is not scored; "unsure" objects are left out.
function objectScores() {
  const judged = objectTruth.flatMap((o) => {
    const c = cases.find((k) => k.labels.id === o.clip && k.target.name === o.target);
    if (!c || o.truth === "unsure") return [];
    const verdict = (c.report.tracks ?? []).find((t) => t.objectId === o.objectId)?.verdict;
    return verdict ? [{ ...o, verdict }] : [];
  });
  if (!judged.length) return null;
  const products = judged.filter((o) => o.truth === "product");
  const others = judged.filter((o) => o.truth === "other");
  const correct = judged.filter((o) => (o.truth === "product") === (o.verdict === "match")).length;
  return {
    judged: judged.length,
    unsure: objectTruth.filter((o) => o.truth === "unsure" && cases.some((k) => k.labels.id === o.clip && k.target.name === o.target)).length,
    hosted: {
      correct,
      lookalikesCounted: others.filter((o) => o.verdict === "match").length,
      productsMissed: products.filter((o) => o.verdict !== "match").length,
      unclear: products.filter((o) => o.verdict === "unclear").length,
      interval: clopperPearson(correct, judged.length),
    },
    samAlone: { correct: products.length, lookalikesCounted: others.length, productsMissed: 0, interval: clopperPearson(products.length, judged.length) },
    // What the look-alikes were, in the object labels' own words, and whether the app counted each.
    lookalikes: others.map((o) => ({ clip: o.clip, target: o.target, objectId: o.objectId, note: o.note ?? "", counted: o.verdict === "match" })),
  };
}
const objects = objectScores();

// Who checked the labels: a person, by name, or nobody yet. An empty checkedBy is a draft; "Claude, …" is a model.
const scoredLabels = labelled.filter((l) => clipIds.includes(l.id));
const byPerson = (l: Labels) => !!l.checkedBy?.trim() && !/^claude\b/i.test(l.checkedBy.trim());
const labelChecks = {
  clips: scoredLabels.length,
  checkedByPerson: scoredLabels.filter(byPerson).length,
  checkedBy: Object.fromEntries(scoredLabels.filter((l) => l.checkedBy?.trim()).map((l) => [l.id, l.checkedBy!.trim()])),
};

// The spoken terms, once a person labelled them in /label: did the app hear the brand (and how far off its time was),
// and did it find the ad disclosure a person found. "implied" is not a disclosure. One per clip, not per product.
function spokenScores() {
  const perClip = clipIds.map((id) => cases.find((c) => c.labels.id === id)!);
  if (!perClip.some(({ labels: l }) => l.saidBrand !== undefined || l.disclosure !== undefined)) return null;
  const done = perClip.filter(({ labels: l }) => typeof l.saidBrand === "boolean" && !!l.disclosure && (!l.saidBrand || typeof l.saidBrandAtSec === "number"));
  const rows = done.map(({ labels: l, report }) => {
    const heard = report.metrics.mentions ?? [];
    const term = (report.terms ?? []).find((t) => t.term.rule?.kind === "disclosed");
    const d = report.disclosure;
    return {
      clip: l.id,
      saidBrand: l.saidBrand!,
      saidBrandAtSec: l.saidBrand ? l.saidBrandAtSec! : null,
      appHeardBrand: heard.length > 0,
      appFirstSec: heard.length ? Math.min(...heard.map((m) => m.startSec)) : null,
      disclosure: l.disclosure!,
      appDisclosed: term ? term.pass : d ? d.spoken.length + d.onScreen.length > 0 : null,
      appSaid: d ? d.spoken.length > 0 : null,
      appShown: d ? d.onScreen.length > 0 : null,
    };
  });
  const errors = rows.flatMap((r) => (r.saidBrandAtSec !== null && r.appFirstSec !== null ? [Math.abs(r.appFirstSec - r.saidBrandAtSec)] : []));
  const disclosed = (d: SpokenDisclosure) => d === "said" || d === "shown" || d === "both";
  const agree = (pairs: [boolean | null, boolean][]) => ({ agree: pairs.filter(([a, b]) => a === b).length, of: pairs.length });
  return {
    labelled: rows.length,
    of: perClip.length,
    brand: {
      ...agree(rows.map((r) => [r.appHeardBrand, r.saidBrand])),
      timed: errors.length,
      meanAbsErrorSec: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
      maxAbsErrorSec: errors.length ? Math.max(...errors) : null,
    },
    disclosure: {
      ...agree(rows.map((r) => [r.appDisclosed, disclosed(r.disclosure)])),
      said: agree(rows.map((r) => [r.appSaid, r.disclosure === "said" || r.disclosure === "both"])),
      shown: agree(rows.map((r) => [r.appShown, r.disclosure === "shown" || r.disclosure === "both"])),
    },
    rows,
  };
}
const spoken = spokenScores();

// The day of the newest run scored (UTC, as receipts store it), unless --measured-at says otherwise.
const newest = reports.map((r) => r.startedAt ?? "").sort().at(-1);
if (!measuredAtFlag && !newest) console.warn("warning: no report has a receipt date; measuredAt is today's date");
const measuredAt = measuredAtFlag ?? (newest || new Date().toISOString()).slice(0, 10);

for (const r of verified.score.rows) {
  const p = r.precision === null ? "n/a " : `${(r.precision * 100).toFixed(0).padStart(3)}%`;
  const rc = r.recall === null ? "n/a " : `${(r.recall * 100).toFixed(0).padStart(3)}%`;
  console.log(
    `${`${r.clip}:${r.target}`.padEnd(36)} truth ${r.truthSec.toFixed(1).padStart(5)} s  predicted ${r.predictedSec.toFixed(1).padStart(5)} s  precision ${p}  recall ${rc}`,
  );
}
console.log(`\nOverall (per frame): precision ${pct(verified.score.precision)}  recall ${pct(verified.score.recall)}  F1 ${pct(verified.score.f1)}`);
if (set) {
  console.log(
    `Set: ${set.clips} clips, ${set.frames} frames at ${FPS} fps, ${set.positives} with the product labelled (${(set.positives / FPS).toFixed(1)} s), ${set.negatives} without`,
  );
}
console.log(
  `95% interval, resampling whole clips (seed ${BOOTSTRAP.seed}, ${BOOTSTRAP.resamples} draws): precision ${range(intervals.verified.precision)}  ` +
    `recall ${range(intervals.verified.recall)}  F1 ${range(intervals.verified.f1)}`,
);
console.log("\nAblation (same runs):");
for (const s of scores) {
  console.log(
    `  ${(s.mode === "sam" ? "SAM 3.1 alone" : "SAM 3.1 + Muse Spark").padEnd(22)} precision ${pct(s.precision).padStart(6)}  recall ${pct(s.recall).padStart(6)}  F1 ${pct(s.f1).padStart(6)}  ` +
      `mean error ${s.meanAbsErrorSec.toFixed(2)} s  seconds counted on clips without the product ${s.falseSecondsOnEmptyClips.toFixed(1)}`,
  );
}
if (withoutLookalikes.clips.length) {
  console.log(`  Without ${withoutLookalikes.clips.join(", ")} (look-alike only):`);
  for (const [name, s] of [["SAM 3.1 alone", withoutLookalikes.sam], ["SAM 3.1 + Muse Spark", withoutLookalikes.verified]] as const) {
    console.log(`    ${name.padEnd(20)} precision ${pct(s.precision).padStart(6)}  recall ${pct(s.recall).padStart(6)}  F1 ${pct(s.f1).padStart(6)}`);
  }
}
if (payHold.of) {
  const off = payHold.rows.filter((r) => r.labelsPay !== r.appPay).map((r) => `${r.clip} labels ${r.labelsPay ? "pay" : "hold"}, app ${r.appPay ? "pay" : "hold"}`);
  console.log(`\nPay or hold on the on-screen term agrees with the labels on ${payHold.of - off.length} of ${payHold.of}${off.length ? ` (${off.join("; ")})` : ""}`);
}
if (objects) {
  console.log(
    `Objects: hosted Muse Spark ${objects.hosted.correct} of ${objects.judged} correct (95% CI ${range(objects.hosted.interval)}), ` +
      `SAM 3.1 alone ${objects.samAlone.correct} of ${objects.judged} (${range(objects.samAlone.interval)}); ${objects.unsure} unsure left out`,
  );
}
console.log(`Labels checked by a person: ${labelChecks.checkedByPerson} of ${labelChecks.clips}`);
const costs = reports.flatMap((r) => (r.costUsd === undefined ? [] : [r.costUsd]));
if (costs.length) {
  console.log(
    `Meta API cost of these runs: $${costs.reduce((a, b) => a + b, 0).toFixed(4)} for ${costs.length} ($${Math.min(...costs).toFixed(4)}–${Math.max(...costs).toFixed(4)} each)`,
  );
}
if (spoken) {
  console.log(
    `Spoken terms (${spoken.labelled} of ${spoken.of} labelled by a person): brand heard ${spoken.brand.agree} of ${spoken.brand.of}, ` +
      `disclosure ${spoken.disclosure.agree} of ${spoken.disclosure.of}`,
  );
}
console.log(`Measured ${measuredAt}${measuredAtFlag ? " (--measured-at)" : newest ? " (newest run scored)" : " (today: no run dates)"}`);
if (jsonPath) {
  const out = { measuredAt, fps: FPS, scores, set, intervals, withoutLookalikes, payHold, objects, labels: labelChecks, reports, spoken };
  await writeFile(jsonPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote ${jsonPath}`);
}
