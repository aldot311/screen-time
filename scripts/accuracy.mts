// Compare pipeline reports (data/out/<target>/<clip>/report.json) with labels (data/labels/<id>.json), frame by frame.
// Usage: pnpm accuracy [data/out] [--json path]
//
// Two ablation rows come from the same runs, with no new model calls:
// - "SAM 3.1 alone": every frame where SAM drew a box for the prompt, before Muse Spark judged any object (so a
//   look-alike counts as the product);
// - "SAM 3.1 + Muse Spark": only the objects Muse Spark confirmed as the brand's product (what the app reports).
// --json writes both, per target and overall, for the in-app accuracy page.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FPS, type VideoReport } from "@/lib/types";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const jsonPath = jsonAt >= 0 ? args[jsonAt + 1] : null;
const outDir = args.find((a, i) => !a.startsWith("--") && i !== jsonAt + 1) ?? "data/out";
const labelsDir = "data/labels";

interface Target {
  name: string;
  ranges: [number, number][];
}

interface Labels {
  id: string;
  targets: Target[];
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

const labelFiles = (await readdir(labelsDir, { recursive: true })).filter((f) => f.endsWith(".json"));
const labelled: Labels[] = await Promise.all(labelFiles.map(async (f) => JSON.parse(await readFile(join(labelsDir, f), "utf8"))));

async function score(mode: Mode): Promise<Score> {
  let tp = 0, fp = 0, fn = 0, absErr = 0, n = 0, emptySec = 0;
  const rows: Row[] = [];
  for (const labels of labelled) {
    for (const target of labels.targets) {
      const name = `${labels.id}:${target.name}`;
      let report: VideoReport;
      try {
        report = JSON.parse(await readFile(join(outDir, target.name, labels.id, "report.json"), "utf8"));
      } catch {
        continue;
      }
      const truth = labelFrames(target);
      const pred = reportFrames(report, name, mode);
      const t = [...pred].filter((f) => truth.has(f)).length;
      tp += t;
      fp += pred.size - t;
      fn += [...truth].filter((f) => !pred.has(f)).length;
      absErr += Math.abs(pred.size - truth.size) / FPS;
      n++;
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
  }
  const P = tp + fp ? tp / (tp + fp) : null;
  const R = tp + fn ? tp / (tp + fn) : null;
  // Missing every positive frame is an F1 of 0 even though precision is undefined.
  const F1 = R === 0 ? 0 : P === null || R === null ? null : (2 * P * R) / (P + R);
  return { mode, rows, precision: P, recall: R, f1: F1, meanAbsErrorSec: n ? absErr / n : 0, falseSecondsOnEmptyClips: emptySec };
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const scores = [await score("sam"), await score("verified")];
const verified = scores[1];
if (!verified.rows.length) {
  console.log("No labelled frames to score yet (need data/labels/<id>.json and a matching report).");
  process.exit(0);
}
for (const r of verified.rows) {
  const p = r.precision === null ? "n/a " : `${(r.precision * 100).toFixed(0).padStart(3)}%`;
  const rc = r.recall === null ? "n/a " : `${(r.recall * 100).toFixed(0).padStart(3)}%`;
  console.log(
    `${`${r.clip}:${r.target}`.padEnd(36)} truth ${r.truthSec.toFixed(1).padStart(5)} s  predicted ${r.predictedSec.toFixed(1).padStart(5)} s  precision ${p}  recall ${rc}`,
  );
}
console.log(`\nOverall (per frame): precision ${pct(verified.precision)}  recall ${pct(verified.recall)}  F1 ${pct(verified.f1)}`);
console.log("\nAblation (same runs):");
for (const s of scores) {
  console.log(
    `  ${(s.mode === "sam" ? "SAM 3.1 alone" : "SAM 3.1 + Muse Spark").padEnd(22)} precision ${pct(s.precision).padStart(6)}  recall ${pct(s.recall).padStart(6)}  F1 ${pct(s.f1).padStart(6)}  ` +
      `mean error ${s.meanAbsErrorSec.toFixed(2)} s  seconds counted on clips without the product ${s.falseSecondsOnEmptyClips.toFixed(1)}`,
  );
}
if (jsonPath) {
  await writeFile(jsonPath, JSON.stringify({ measuredAt: new Date().toISOString().slice(0, 10), fps: FPS, scores }, null, 2) + "\n");
  console.log(`\nwrote ${jsonPath}`);
}
