// How Muse Spark reads plain-English contract terms into typed rules, through the app's own prompt, schema and mapper
// (parseTermsPrompt, TERMS_SCHEMA, toContractTerms, so the guards apply as they do in a run).
//
// data/contract-eval/cases.json holds 30 terms: 21 with the rule a careful reader would write (the live campaign's 3
// among them) and 9 that no rule kind can check, which must stay unchecked so a person reads them. Each term is read 3
// times alone and 3 times inside a 15-term contract (which tests that each rule lands on its own term): 96 calls.
// A term's outcome is the worst of its 6 readings (src/lib/pipeline/contract-eval.ts says what each outcome means).
//
// Usage:
//   pnpm contract-eval                 # dry run: checks the cases, prints the plan and a rough price; no calls
//   pnpm contract-eval --run           # calls Muse Spark (needs META_MODEL_API_KEY), writes src/lib/contract-eval-data.json
//   pnpm contract-eval --run --json <path>
// The calls go to the Meta Model API through the app's client, never through the app's CostGuard or its ledger (each
// call would book a $0.02 reserve against the app's own spending cap). The price comes from each response's usage.
import { readFile, writeFile } from "node:fs/promises";
import { buildSparkJsonBody, extractJsonOutput, getApiKey, metaRequest, MODELS } from "@/lib/meta";
import { toContractTerms } from "@/lib/pipeline/prompts";
import {
  caseProblems,
  contractRulesRequest,
  estimateUsd,
  evalContracts,
  evalData,
  outcomeOf,
  ruleText,
  usageUsd,
  type EvalCase,
} from "@/lib/pipeline/contract-eval";
import type { ContractRule } from "@/lib/types";

const CASES = "data/contract-eval/cases.json";
const args = process.argv.slice(2);
const run = args.includes("--run");
const jsonPath = args.includes("--json") ? args[args.indexOf("--json") + 1] : "src/lib/contract-eval-data.json";
// A few calls at a time: the whole set takes a couple of minutes instead of several, far under the rate limit.
const PARALLEL = 4;

const cases = JSON.parse(await readFile(CASES, "utf8")) as EvalCase[];
const problems = caseProblems(cases);
if (problems.length) {
  console.error(`${CASES} has problems:\n${problems.join("\n")}`);
  process.exit(1);
}
const byId = new Map(cases.map((c) => [c.id, c]));
const contracts = evalContracts(cases).map((k) => ({ ...k, terms: k.ids.map((id) => byId.get(id)!.clause) }));
const expected = cases.filter((c) => c.expect !== null);
console.log(
  `${cases.length} terms: ${expected.length} with an expected rule (${cases.filter((c) => c.live).length} of them live), ${cases.length - expected.length} that must stay unchecked`,
);
console.log(`${contracts.length} calls: ${contracts.filter((k) => k.ids.length === 1).length} one-term contracts, ${contracts.filter((k) => k.ids.length > 1).length} longer ones`);
const est = estimateUsd(contracts.map((k) => k.terms));
console.log(`rough price: about ${est.inputTokens} input and ${est.outputTokens} output tokens, about $${est.usd.toFixed(2)} at list prices`);

if (!run) {
  console.log("Dry run: no calls made, nothing written. Add --run to call Muse Spark.");
  process.exit(0);
}

getApiKey(); // fails here, before any call, when the key is missing
const readings: Record<string, (ContractRule | null)[]> = {};
const answers: (ContractRule | null)[][] = [];
const usage = { calls: 0, withoutUsage: 0, usd: 0 };
let next = 0;
let failure: unknown = null;

async function read(i: number) {
  const k = contracts[i];
  const body = JSON.stringify(buildSparkJsonBody(contractRulesRequest(k.terms)));
  const res = await metaRequest("/responses", {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    makeBody: () => body,
    // A dropped connection may still have been billed: fail rather than pay twice, as the app does.
    retryNetworkErrors: false,
  });
  const json = (await res.json()) as { usage?: unknown };
  const usd = usageUsd(json.usage);
  usage.calls++;
  if (usd === null) usage.withoutUsage++;
  else usage.usd += usd;
  answers[i] = toContractTerms(k.terms, extractJsonOutput(json as Parameters<typeof extractJsonOutput>[0])).map((t) => t.rule);
  const outcomes = answers[i].map((rule, j) => outcomeOf(byId.get(k.ids[j])!.expect, rule));
  const line =
    k.ids.length === 1
      ? `${ruleText(answers[i][0])} (${outcomes[0]})`
      : [...new Set(outcomes)].map((o) => `${outcomes.filter((x) => x === o).length} ${o}`).join(", ");
  console.log(`[${usage.calls}/${contracts.length}] ${k.label}: ${line}`);
}

// A failed call (after the client's own retries) stops new calls; the ones in flight finish, so their cost is counted.
// Its term would have no reading, and a missing reading is not a refusal, so nothing is written.
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (failure === null && next < contracts.length) {
      try {
        await read(next++);
      } catch (err) {
        failure ??= err;
      }
    }
  }),
);
if (failure !== null) {
  console.error(`Stopped: ${failure instanceof Error ? failure.message : failure}`);
  console.error(`Nothing written. ${usage.calls} calls answered, $${usage.usd.toFixed(3)} by their usage.`);
  process.exit(1);
}

// In plan order, so each term's readings are its alone runs, then its runs inside a longer contract.
contracts.forEach((k, i) => k.ids.forEach((id, j) => (readings[id] ??= []).push(answers[i][j])));
const costUsd = Math.round(usage.usd * 1e6) / 1e6;
const data = evalData(cases, readings, { measuredAt: new Date().toISOString().slice(0, 10), model: MODELS.spark, costUsd });
console.log(`expected rule: ${data.expected.exact} exact, ${data.expected.safeMiss} safe-miss, ${data.expected.misread} misread (of ${data.expected.total})`);
console.log(`must stay unchecked: ${data.mustRefuse.refused} refused, ${data.mustRefuse.passedThrough} passed through (of ${data.mustRefuse.total})`);
console.log(`live terms: ${data.live.exact} of ${data.live.total} exact in all ${data.runsPerCase} readings`);
for (const r of data.rows.filter((r) => r.outcome !== "exact" && r.outcome !== "refused")) console.log(`  ${r.id} ${r.outcome}: "${r.text}" -> ${[...new Set(r.got)].join(" | ")}`);
console.log(`cost: $${usage.usd.toFixed(3)} over ${usage.calls} calls${usage.withoutUsage ? ` (${usage.withoutUsage} calls returned no usage and are not counted)` : ""}`);
await writeFile(jsonPath, JSON.stringify(data, null, 2) + "\n");
console.log(`wrote ${jsonPath}`);
