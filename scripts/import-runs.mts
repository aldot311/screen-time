// Turn CLI test runs (data/out/<target>/<clip>/report.json) into app campaigns, one per target, so the
// real reports with SAM's boxes show in the UI. Usage: pnpm import-runs [data/out]
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { putCampaign, putVideo, saveVideoFile, slugify } from "@/lib/campaign/store";
import type { VideoReport } from "@/lib/types";

const outDir = process.argv[2] ?? "data/out";

interface Target {
  name: string;
  prompt: string;
  product: string;
  brandTerms: string[];
}

const CREATORS: Record<string, string> = { clip: "@aldo.tile", stock: "@pexels" };
const BRANDS: Record<string, string> = {
  "alani-can": "Alani Nu",
  "stanley-tumbler": "Stanley",
  "new-balance-sneaker": "New Balance",
  "singaraja-can": "Singaraja",
};

// Target definitions come from the labels, so prompts and product descriptions match the runs.
const targets = new Map<string, Target>();
for (const f of (await readdir("data/labels", { recursive: true })).filter((f) => f.endsWith(".json"))) {
  for (const t of JSON.parse(await readFile(join("data/labels", f), "utf8")).targets as Target[]) targets.set(t.name, t);
}

const now = new Date().toISOString();
for (const name of await readdir(outDir)) {
  const target = targets.get(name);
  if (!target) continue;
  const reports = (await readdir(join(outDir, name), { recursive: true })).filter((f) => f.endsWith("report.json"));
  if (!reports.length) continue;
  const brand = BRANDS[name] ?? target.product.split(" ").slice(1, 3).join(" ");
  const first: VideoReport = JSON.parse(await readFile(join(outDir, name, reports[0]), "utf8"));
  const id = slugify(`${brand} test runs`);
  await putCampaign({
    id,
    name: `${brand}: test runs`,
    brand,
    prompt: target.prompt,
    productDescription: target.product,
    brandTerms: target.brandTerms ?? [],
    contractTerms: first.terms.map((t) => t.term.text),
    createdAt: now,
  });
  for (const rel of reports) {
    const report: VideoReport = JSON.parse(await readFile(join(outDir, name, rel), "utf8"));
    const clipId = report.videoId;
    const workDir = join(outDir, name, rel.replace(/\/?report\.json$/, ""));
    const videoUrl = await saveVideoFile(id, clipId, await readFile(join(workDir, `${clipId}.mp4`)), "video/mp4", "normalized");
    await putVideo({
      id: clipId,
      campaignId: id,
      creator: CREATORS[clipId.replace(/\d+$/, "")] ?? "@creator",
      title: `${clipId}.mp4`,
      videoUrl,
      status: "done",
      step: "contract",
      report,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log(`${id}: ${reports.length} video(s)`);
}
