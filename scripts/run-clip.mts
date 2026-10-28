// Run one or more local clips through the full pipeline and write a JSON report per clip.
// Usage: pnpm run-clip --prompt "drink can" --product "a teal Celsius energy drink can" \
//   --brand Celsius --term "On screen at least 3 seconds in the first 10 seconds" \
//   --max-usd 0.50 data/videos/clip01.mp4 [more clips...]
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { CostGuard } from "@/lib/meta";
import { runVideo } from "@/lib/pipeline/run";

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
  },
});

if (!values.prompt || !values.product || !positionals.length) {
  console.error("Need --prompt, --product and at least one clip path.");
  process.exit(2);
}

const guard = new CostGuard({
  maxUsdPerRun: Number(values["max-usd"]),
  maxUsdTotal: Number(values["max-total-usd"]),
  ledgerPath: join(values.out, "ledger.json"),
});

for (const clip of positionals) {
  const videoId = basename(clip).replace(/\.[^.]+$/, "");
  const workDir = join(values.out, videoId);
  await mkdir(workDir, { recursive: true });
  const report = await runVideo({
    videoId,
    sourcePath: clip,
    workDir,
    prompt: values.prompt,
    productDescription: values.product,
    brandTerms: values.brand,
    contractTerms: values.term,
    guard,
    log: (msg) => console.log(`[${videoId}] ${msg}`),
  });
  await writeFile(join(workDir, "report.json"), JSON.stringify(report, null, 2));
  const m = report.metrics;
  console.log(
    `[${videoId}] on screen ${m.secondsOnScreen.toFixed(1)} s of ${report.info.durationSec.toFixed(1)} s, ` +
      `prominence ${m.prominenceScore}, mentions ${m.mentions.length}, cost $${report.cost.usd.toFixed(3)}`,
  );
  for (const t of report.terms) console.log(`[${videoId}]   ${t.pass === null ? "?" : t.pass ? "PASS" : "FAIL"} ${t.term.text}: ${t.detail}`);
}
console.log(`Total spent so far: $${(await guard.totalSpentUsd()).toFixed(3)}`);
