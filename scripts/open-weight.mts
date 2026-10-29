// Hosted Muse Spark vs open-weight Muse Spark Open on the look-alike check, on the same crops and the same prompt.
//
// Every object SAM tracked in the labelled test set (data/out/<target>/<clip>/) is scored against object labels
// (data/labels/objects.json): the product, or something else. Hosted verdicts come from the stored
// runs (no new calls). Open-weight verdicts come from an OpenAI-compatible provider that serves Muse Spark Open
// (Baseten, Fireworks, Groq, Modal, Together or OpenRouter host it; the Meta Model API does not list it for this
// account as of 2026-10-29).
//
// Usage:
//   pnpm tsx --tsconfig tsconfig.json scripts/open-weight.mts              # hosted side only
//   OPEN_BASE_URL=https://openrouter.ai/api/v1 OPEN_MODEL=<provider's model id> OPEN_API_KEY=... \
//     pnpm tsx --tsconfig tsconfig.json scripts/open-weight.mts --run [--json src/lib/open-weight-data.json]
// OPEN_USD_IN / OPEN_USD_OUT (per million tokens) price the open run; Baseten lists $1.25 / $4.25.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { VideoReport } from "@/lib/types";
import { VERIFY_SCHEMA, verifyPrompt } from "@/lib/pipeline/prompts";

const OUT = "data/out";
const LABELS = "data/labels";
const args = process.argv.slice(2);
const run = args.includes("--run");
const jsonPath = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

interface Labels {
  id: string;
  targets: { name: string; prompt: string; product: string }[];
}

interface Case {
  clip: string;
  target: string;
  objectId: number;
  truth: "product" | "other";
  hosted: string;
  crops: string[];
  prompt: string;
  product: string;
}

/** Object-level truth from data/labels/objects.json (the frame labels cannot tell two objects on screen together
 *  apart); "unsure" objects are left out. */
async function cases(): Promise<Case[]> {
  const objects = JSON.parse(await readFile(join(LABELS, "objects.json"), "utf8")).objects as { clip: string; target: string; objectId: number; truth: string }[];
  const briefs = new Map<string, { prompt: string; product: string }>();
  for (const f of (await readdir(LABELS, { recursive: true })).filter((f) => f.endsWith(".json") && !f.endsWith("objects.json"))) {
    for (const t of (JSON.parse(await readFile(join(LABELS, f), "utf8")) as Labels).targets) briefs.set(t.name, { prompt: t.prompt, product: t.product });
  }
  const out: Case[] = [];
  for (const o of objects) {
    if (o.truth === "unsure") continue;
    const dir = join(OUT, o.target, o.clip);
    const report: VideoReport = JSON.parse(await readFile(join(dir, "report.json"), "utf8"));
    const clipName = o.clip.split("/").pop()!;
    const brief = briefs.get(o.target) ?? { prompt: report.prompt, product: "" };
    out.push({
      ...o,
      truth: o.truth as "product" | "other",
      hosted: report.tracks.find((t) => t.objectId === o.objectId)?.verdict ?? "missing",
      crops: [0, 1, 2].map((i) => join(dir, `${clipName}-obj${o.objectId}-${i}.jpg`)),
      prompt: brief.prompt,
      product: brief.product,
    });
  }
  return out;
}

function score(rows: { truth: string; verdict: string }[]) {
  const tp = rows.filter((r) => r.truth === "product" && r.verdict === "match").length;
  const fp = rows.filter((r) => r.truth !== "product" && r.verdict === "match").length;
  const fn = rows.filter((r) => r.truth === "product" && r.verdict !== "match").length;
  const correct = rows.filter((r) => (r.truth === "product") === (r.verdict === "match")).length;
  return { objects: rows.length, accuracy: rows.length ? correct / rows.length : null, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, falseMatches: fp, missedMatches: fn };
}

async function openVerdict(c: Case): Promise<{ verdict: string; ms: number; usd: number; raw?: string }> {
  const images = await Promise.all(
    c.crops.map(async (p) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${(await readFile(p).catch(() => Buffer.alloc(0))).toString("base64")}` } })),
  );
  const body = {
    model: process.env.OPEN_MODEL,
    messages: [{ role: "user", content: [{ type: "text", text: verifyPrompt(c.product, c.prompt, false) }, ...images.filter((i) => i.image_url.url.length > 40)] }],
    response_format: { type: "json_schema", json_schema: { name: "product_check", schema: VERIFY_SCHEMA, strict: true } },
  };
  const t0 = performance.now();
  const res = await fetch(`${process.env.OPEN_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPEN_API_KEY}` },
    body: JSON.stringify(body),
  });
  const ms = Math.round(performance.now() - t0);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: unknown };
  const text = j.choices?.[0]?.message?.content ?? "";
  const usd = ((j.usage?.prompt_tokens ?? 0) * Number(process.env.OPEN_USD_IN ?? 1.25) + (j.usage?.completion_tokens ?? 0) * Number(process.env.OPEN_USD_OUT ?? 4.25)) / 1e6;
  try {
    return { verdict: (JSON.parse(text) as { verdict: string }).verdict, ms, usd };
  } catch {
    return { verdict: "error", ms, usd, raw: JSON.stringify(j).slice(0, 200) };
  }
}

const all = await cases();
const hosted = score(all.map((c) => ({ truth: c.truth, verdict: c.hosted })));
console.log(`${all.length} tracked objects (${all.filter((c) => c.truth === "product").length} the product, ${all.filter((c) => c.truth === "other").length} something else; unsure ones left out)`);
console.log("hosted Muse Spark 1.3:", JSON.stringify(hosted));
const result: Record<string, unknown> = { measuredAt: new Date().toISOString().slice(0, 10), hosted: { model: "muse-spark-1.3", ...hosted } };

if (run) {
  for (const k of ["OPEN_BASE_URL", "OPEN_MODEL", "OPEN_API_KEY"]) if (!process.env[k]) throw new Error(`${k} is not set`);
  const rows: { clip: string; objectId: number; truth: string; hosted: string; open: string; ms: number; usd: number }[] = [];
  for (const c of all) {
    const v = await openVerdict(c);
    rows.push({ clip: c.clip, objectId: c.objectId, truth: c.truth, hosted: c.hosted, open: v.verdict, ms: v.ms, usd: v.usd });
    console.log(`${c.clip} obj${c.objectId}: truth ${c.truth}, hosted ${c.hosted}, open ${v.verdict}${v.raw ? ` (${v.raw})` : ""} ${v.ms} ms`);
  }
  const open = score(rows.map((r) => ({ truth: r.truth, verdict: r.open })));
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  result.open = { model: process.env.OPEN_MODEL, provider: process.env.OPEN_BASE_URL, ...open, medianMs: ms[Math.floor(ms.length / 2)], usd: rows.reduce((n, r) => n + r.usd, 0) };
  result.agreement = rows.filter((r) => (r.hosted === "match") === (r.open === "match")).length / rows.length;
  console.log("open-weight:", JSON.stringify(result.open), "agreement with hosted:", result.agreement);
}
if (jsonPath) {
  await writeFile(jsonPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`wrote ${jsonPath}`);
}
