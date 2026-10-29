// Run one or more local clips through the full pipeline and write a JSON report per clip.
// Usage: pnpm run-clip --prompt "drink can" --product "a teal Celsius energy drink can" \
//   --brand Celsius --term "On screen at least 3 seconds in the first 10 seconds" \
//   --target celsius --max-usd 0.50 [--product-photo can.jpg] data/videos/clip01.mp4 [more clips...]
// Reports land in <out>/[<target>/]<clip>/report.json, the layout scripts/accuracy.mts reads.
// --max-usd caps each clip; --max-total-usd caps the shared ledger across clips and runs.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CostGuard } from "@/lib/meta";
import { runVideo } from "@/lib/pipeline/run";
import { MAX_IMAGE_BYTES, sniffImageType } from "@/lib/campaign/schema";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    prompt: { type: "string" },
    product: { type: "string" },
    brand: { type: "string", multiple: true, default: [] },
    term: { type: "string", multiple: true, default: [] },
    "max-usd": { type: "string", default: "0.50" },
    "max-total-usd": { type: "string", default: "20" },
    out: { type: "string", default: "data/out" },
    target: { type: "string" },
    // A JPEG, PNG or WebP of the product: Muse Spark compares each tracked object against it.
    "product-photo": { type: "string" },
  },
});

if (!values.prompt || !values.product || !positionals.length) {
  console.error("Need --prompt, --product and at least one clip path.");
  process.exit(2);
}

const target = values.target;
if (target !== undefined && (!target || target === "." || target === ".." || /[/\\]/.test(target))) {
  console.error(`--target must be a plain folder name, got "${target}".`);
  process.exit(2);
}
let productImageUrl: string | undefined;
if (values["product-photo"]) {
  const bytes = new Uint8Array(await readFile(values["product-photo"]));
  const type = bytes.length <= MAX_IMAGE_BYTES ? sniffImageType(bytes) : null;
  if (!type) {
    console.error(`--product-photo must be a JPEG, PNG or WebP of at most 8 MB.`);
    process.exit(2);
  }
  productImageUrl = `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

const reportRoot = target ? join(values.out, target) : values.out;

// One guard per clip, so --max-usd is a per-clip cap; all share one ledger, so --max-total-usd spans the batch.
const ledgerPath = join(values.out, "ledger.json");
const newGuard = () =>
  new CostGuard({
    maxUsdPerRun: Number(values["max-usd"]),
    maxUsdTotal: Number(values["max-total-usd"]),
    ledgerPath,
  });

// Labels name a clip by its path under data/videos (stock/stock01), and reports are written under that
// same path, so clips with the same file name in different folders never share a work dir.
const videosDir = resolve("data/videos");
const clips = positionals.map((path) => {
  const rel = relative(videosDir, resolve(path));
  const inside = rel && !rel.startsWith("..") && !isAbsolute(rel);
  const label = (inside ? rel.split(/[/\\]/).join("/") : basename(path)).replace(/\.[^.]+$/, "");
  return { path, label, videoId: label.split("/").at(-1)! };
});
const byId = new Map<string, string>();
for (const c of clips) {
  const seen = byId.get(c.label);
  if (seen !== undefined) {
    console.error(`"${seen}" and "${c.path}" would both write to ${join(reportRoot, c.label)}; rename one.`);
    process.exit(2);
  }
  byId.set(c.label, c.path);
}

for (const { path: clip, label, videoId } of clips) {
  const workDir = join(reportRoot, label);
  await mkdir(workDir, { recursive: true });
  const report = await runVideo({
    videoId,
    sourcePath: clip,
    workDir,
    prompt: values.prompt,
    productDescription: values.product,
    brandTerms: values.brand,
    contractTerms: values.term,
    productImageUrl,
    guard: newGuard(),
    log: (msg) => console.log(`[${label}] ${msg}`),
  });
  await writeFile(join(workDir, "report.json"), JSON.stringify(report, null, 2));
  const m = report.metrics;
  console.log(
    `[${label}] on screen ${m.secondsOnScreen.toFixed(1)} s of ${report.info.durationSec.toFixed(1)} s, ` +
      `prominence ${m.prominenceScore}, mentions ${m.mentions.length}, cost $${report.cost.usd.toFixed(3)}`,
  );
  const d = report.disclosure;
  console.log(
    `[${label}] product photo used: ${report.usedProductPhoto ? "yes" : "no"}; disclosure: ` +
      (d ? `${d.spoken.length} spoken, ${d.onScreen.length} on screen` : "not checked"),
  );
  for (const t of report.terms) console.log(`[${label}]   ${t.pass === null ? "?" : t.pass ? "PASS" : "FAIL"} ${t.term.text}: ${t.detail}`);
}
console.log(`Total spent so far: $${(await newGuard().totalSpentUsd()).toFixed(3)}`);
