// Writes data/runs: the reports of the campaign runs the site shows, trimmed to what `pnpm accuracy` and the
// accuracy page need, one per labelled clip (data/runs/<target>/<clip id>/report.json).
// Usage: pnpm tsx --tsconfig tsconfig.json scripts/export-runs.mts <videos> [--labels data/labels/lacroix] [--out data/runs]
// <videos> is a folder of a campaign's video documents (a local store's campaigns/<id>/videos) or the JSON that
// GET /api/campaigns/<id> returns. Each video maps to its clip by clipVideoId (components/ed/accuracy-summary.ts).
//
// Kept: frame counts, every tracked frame with its object's verdict, the frames counted, the track verdicts, the
// contract terms with their results, the brand mentions and disclosures heard or read (time and the matched words),
// and the receipt's run id, start and cost. Dropped: every URL (media, the product photo), boxes, crops, Muse Spark's
// reasons and the rest of the receipt.
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { clipVideoId } from "@/components/ed/accuracy-summary";
import type { VideoReport } from "@/lib/types";

const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const labelsDir = flag("--labels") ?? "data/labels/lacroix";
const outDir = flag("--out") ?? "data/runs";
const from = args.find((a, i) => !a.startsWith("--") && !["--labels", "--out"].includes(args[i - 1]));
if (!from) {
  console.error("Usage: scripts/export-runs.mts <campaign videos folder or campaign JSON> [--labels data/labels/lacroix] [--out data/runs]");
  process.exit(1);
}

interface VideoDoc {
  id: string;
  status: string;
  report?: VideoReport;
}

async function videos(path: string): Promise<VideoDoc[]> {
  if ((await stat(path)).isDirectory()) {
    const files = (await readdir(path)).filter((f) => f.endsWith(".json")).sort();
    return Promise.all(files.map(async (f) => JSON.parse(await readFile(join(path, f), "utf8"))));
  }
  return (JSON.parse(await readFile(path, "utf8")) as { videos: VideoDoc[] }).videos;
}

const span = ({ startSec, endSec, text }: { startSec: number; endSec: number; text: string }) => ({ startSec, endSec, text });

function trimReport(r: VideoReport) {
  return {
    videoId: r.videoId,
    info: { frameCount: r.info.frameCount },
    tracks: r.tracks.map(({ objectId, verdict, visibility }) => ({ objectId, verdict, visibility })),
    detections: (r.detections ?? []).map(({ frame, objectId, verdict }) => ({ frame, objectId, verdict })),
    metrics: {
      secondsOnScreen: r.metrics.secondsOnScreen,
      visibleFrames: r.metrics.visibleFrames,
      segments: r.metrics.segments.map(({ startSec, endSec }) => ({ startSec, endSec })),
      mentions: r.metrics.mentions.map(span),
    },
    terms: r.terms.map(({ term, pass }) => ({ term: { text: term.text, rule: term.rule }, pass })),
    ...(r.disclosure
      ? {
          disclosure: {
            spoken: r.disclosure.spoken.map(span),
            onScreen: r.disclosure.onScreen.map(({ startSec, text }) => ({ startSec, text })),
            onScreenChecked: r.disclosure.onScreenChecked,
          },
        }
      : {}),
    cost: { samFrames: r.cost.samFrames, usd: r.cost.usd },
    ...(r.receipt ? { receipt: { runId: r.receipt.runId, startedAt: r.receipt.startedAt } } : {}),
  };
}

const docs = await videos(from);
let written = 0;
for (const f of (await readdir(labelsDir, { recursive: true })).filter((f) => f.endsWith(".json")).sort()) {
  const labels = JSON.parse(await readFile(join(labelsDir, f), "utf8")) as { id?: string; targets?: { name: string }[] };
  if (!labels.id || !Array.isArray(labels.targets)) continue; // objects.json, checklist.json
  const video = docs.find((v) => v.id === clipVideoId(labels.id!));
  if (!video?.report || video.status !== "done") {
    console.warn(`${labels.id}: no finished campaign video${video ? ` (${video.id} is ${video.status})` : ""}`);
    continue;
  }
  for (const t of labels.targets) {
    const path = join(outDir, t.name, labels.id, "report.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(trimReport(video.report), null, 2) + "\n");
    written++;
    console.log(`${video.id} → ${path}`);
  }
}
console.log(`wrote ${written} reports`);
