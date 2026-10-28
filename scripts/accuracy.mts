// Compare pipeline reports (data/out/<target>/<clip>/report.json) with labels (data/labels/<id>.json), frame by frame.
// Usage: pnpm accuracy [data/out]
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { FPS, type VideoReport } from "@/lib/types";

const outDir = process.argv[2] ?? "data/out";
const labelsDir = "data/labels";

interface Target {
  name: string;
  ranges: [number, number][];
}

interface Labels {
  id: string;
  targets: Target[];
}

function labelFrames(l: Target): Set<number> {
  const s = new Set<number>();
  for (const [a, b] of l.ranges) for (let f = a; f <= b; f++) s.add(f);
  return s;
}

// The report keeps on-screen time as segments in seconds; turn them back into frame indices.
function reportFrames(r: VideoReport): Set<number> {
  const s = new Set<number>();
  for (const seg of r.metrics.segments) {
    for (let f = Math.round(seg.startSec * FPS); f < Math.round(seg.endSec * FPS); f++) s.add(f);
  }
  return s;
}

const labelFiles = (await readdir(labelsDir, { recursive: true })).filter((f) => f.endsWith(".json"));
let tp = 0, fp = 0, fn = 0;
const rows: string[] = [];
for (const file of labelFiles) {
  const labels: Labels = JSON.parse(await readFile(join(labelsDir, file), "utf8"));
  const clip = labels.id.split("/").at(-1)!;
  for (const target of labels.targets) {
    const name = `${labels.id}:${target.name}`;
    let report: VideoReport;
    try {
      report = JSON.parse(await readFile(join(outDir, target.name, clip, "report.json"), "utf8"));
    } catch {
      rows.push(`${name.padEnd(36)} no report yet`);
      continue;
    }
    const truth = labelFrames(target);
    const pred = reportFrames(report);
    const t = [...pred].filter((f) => truth.has(f)).length;
    const p = pred.size - t;
    const n = [...truth].filter((f) => !pred.has(f)).length;
    tp += t; fp += p; fn += n;
    const prec = pred.size ? t / pred.size : truth.size ? 0 : 1;
    const rec = truth.size ? t / truth.size : 1;
    rows.push(
      `${name.padEnd(36)} truth ${(truth.size / FPS).toFixed(1).padStart(5)} s  predicted ${(pred.size / FPS).toFixed(1).padStart(5)} s  ` +
        `precision ${(prec * 100).toFixed(0).padStart(3)}%  recall ${(rec * 100).toFixed(0).padStart(3)}%`,
    );
  }
}
console.log(rows.join("\n"));
if (tp + fp + fn === 0) {
  console.log("\nNo labelled frames to score yet (need data/labels/<id>.json and a matching report).");
  process.exit(0);
}
const P = tp + fp ? tp / (tp + fp) : 1;
const R = tp + fn ? tp / (tp + fn) : 1;
console.log(`\nOverall (per frame): precision ${(P * 100).toFixed(1)}%  recall ${(R * 100).toFixed(1)}%  F1 ${((2 * P * R) / (P + R || 1) * 100).toFixed(1)}%`);
