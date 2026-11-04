// The contract-parser eval: plain-English terms, each with the rule a careful reader would write (or none, when no rule
// kind can check it), read by Muse Spark through the app's own prompt, schema and mapper. scripts/contract-eval.mts
// makes the calls; the parts here are pure, so the scoring is tested without a model call.
import type { SparkJsonInput } from "@/lib/meta";
import type { ContractRule } from "@/lib/types";
import { parseTermsPrompt, TERMS_SCHEMA, toContractTerms } from "./prompts";

export interface EvalCase {
  id: string;
  group: string;
  clause: string;
  /** The rule the term should become, or null when no rule kind can check it (it must stay with a person). */
  expect: ContractRule | null;
  /** One of the terms the live campaigns use today. */
  live?: boolean;
  /** Wrong readings worth knowing about, kept as test fixtures. */
  misread?: ContractRule[];
}

/**
 * exact: the expected rule. safe-miss: no rule where one was expected, so a person checks the term. misread: a wrong
 * rule, which checks the video against something the contract does not say. refused: no rule for a term that has
 * none. passed-through: a rule for a term that has none.
 */
export type Outcome = "exact" | "safe-miss" | "misread" | "refused" | "passed-through";

/** src/lib/contract-eval-data.json. Counts are per term: a term's outcome is the worst of its readings. */
export interface ContractEvalData {
  measuredAt: string;
  model: string;
  runsPerCase: number;
  expected: { total: number; exact: number; safeMiss: number; misread: number };
  mustRefuse: { total: number; refused: number; passedThrough: number };
  live: { total: number; exact: number };
  costUsd: number;
  rows: { id: string; text: string; expected: string | null; got: string[]; outcome: Outcome }[];
}

/** Each term is read this many times alone, and as many times again inside a longer contract. */
export const RUNS = 3;
/** Terms per contract in the batched reads (a campaign takes up to 20). */
export const BATCH = 15;

/** The request run.ts parseTerms sends for a contract: same name, schema, strictness, prompt and default effort. */
export function contractRulesRequest(terms: string[]): SparkJsonInput {
  return { name: "contract_rules", schema: TERMS_SCHEMA, strict: true, input: [{ type: "input_text", text: parseTermsPrompt(terms) }] };
}

/** The flat answer TERMS_SCHEMA asks Muse Spark for, for a rule (or "not checkable" for null). */
export function flatAnswer(rule: ContractRule | null, index = 0) {
  const zero = { index, checkable: rule !== null, kind: "min_seconds_total", seconds: 0, withinFirstSec: 0, fraction: 0, forSeconds: 0, minTimes: 0 };
  return { ...zero, ...rule };
}

export function sameRule(a: ContractRule | null, b: ContractRule | null): boolean {
  if (a === null || b === null) return a === b;
  const fields = (r: ContractRule) => Object.entries(r).filter(([, v]) => v !== undefined);
  const fa = fields(a);
  const fb = new Map(fields(b));
  return fa.length === fb.size && fa.every(([k, v]) => fb.get(k) === v);
}

/** What is wrong with a case list: a repeated id, an empty or over-long term, or an expected rule the app's mapper
 *  could never produce (the case would then be scored against a reading no answer can give). */
export function caseProblems(cases: EvalCase[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const c of cases) {
    if (ids.has(c.id)) out.push(`${c.id}: the id is used twice`);
    ids.add(c.id);
    if (!c.clause?.trim() || c.clause.length > 300) out.push(`${c.id}: a term needs 1 to 300 characters, as a campaign takes it`);
    if (c.expect !== null && !sameRule(toContractTerms([c.clause], { rules: [flatAnswer(c.expect)] })[0].rule, c.expect)) {
      out.push(`${c.id}: no answer can produce the expected rule ${JSON.stringify(c.expect)}`);
    }
  }
  return out;
}

/** The contracts to send, as case ids in term order: every case alone RUNS times, then the whole list cut into
 *  contracts of BATCH terms, RUNS times, so a rule landing on the wrong term shows up as a misread. */
export function evalContracts(cases: EvalCase[], runs = RUNS, batch = BATCH): { label: string; ids: string[] }[] {
  const out: { label: string; ids: string[] }[] = [];
  for (let r = 1; r <= runs; r++) for (const c of cases) out.push({ label: `${c.id} alone, run ${r}`, ids: [c.id] });
  for (let r = 1; r <= runs; r++) {
    for (let i = 0; i < cases.length; i += batch) {
      const ids = cases.slice(i, i + batch).map((c) => c.id);
      out.push({ label: `${ids[0]}-${ids[ids.length - 1]} in one contract, run ${r}`, ids });
    }
  }
  return out;
}

const num = (n: number) => String(+n.toFixed(6));

/** A rule in the report's words (as ruleReading has them), with its numbers exact rather than rounded for display. */
export function ruleText(rule: ContractRule | null): string {
  if (!rule) return "no checkable rule, so a person checks it";
  switch (rule.kind) {
    case "min_seconds_total":
      return `on screen ≥ ${num(rule.seconds)} s in total`;
    case "min_seconds_within":
      return `on screen ≥ ${num(rule.seconds)} s within 0–${num(rule.withinFirstSec)} s`;
    case "min_continuous":
      return `one unbroken shot ≥ ${num(rule.seconds)} s`;
    case "min_area":
      return `≥ ${num(rule.fraction * 100)}% of the frame for ≥ ${num(rule.forSeconds)} s`;
    case "mentioned":
      return `brand said ≥ ${rule.minTimes}×${rule.withinFirstSec ? ` within 0–${num(rule.withinFirstSec)} s` : ""}`;
    case "first_seen_before":
      return `first seen before ${num(rule.seconds)} s`;
    case "disclosed":
      return "#ad on screen, or “ad” / “sponsored” said aloud";
  }
}

export function outcomeOf(expect: ContractRule | null, got: ContractRule | null): Outcome {
  if (expect === null) return got === null ? "refused" : "passed-through";
  if (got === null) return "safe-miss";
  return sameRule(got, expect) ? "exact" : "misread";
}

// From best to worst; a term's readings all fall on one side (expected rule or none), so the order across sides is moot.
const RANK: Outcome[] = ["exact", "refused", "safe-miss", "misread", "passed-through"];

export function worstOutcome(outcomes: Outcome[]): Outcome {
  if (!outcomes.length) throw new Error("A term with no readings has no outcome");
  return outcomes.reduce((a, b) => (RANK.indexOf(b) > RANK.indexOf(a) ? b : a));
}

/** The data file from every term's readings. Every term must have been read the same number of times. */
export function evalData(
  cases: EvalCase[],
  readings: Record<string, (ContractRule | null)[]>,
  meta: { measuredAt: string; model: string; costUsd: number },
): ContractEvalData {
  const runsPerCase = readings[cases[0]?.id]?.length ?? 0;
  const short = runsPerCase ? cases.find((c) => (readings[c.id]?.length ?? 0) !== runsPerCase) : cases[0];
  if (!cases.length || short) throw new Error(`Every term needs the same number of readings, at least one (${short?.id ?? "no terms"})`);
  const rows = cases.map((c) => ({
    id: c.id,
    text: c.clause,
    expected: c.expect ? ruleText(c.expect) : null,
    got: readings[c.id].map(ruleText),
    outcome: worstOutcome(readings[c.id].map((got) => outcomeOf(c.expect, got))),
  }));
  const count = (o: Outcome, of = rows) => of.filter((r) => r.outcome === o).length;
  const live = rows.filter((_, i) => cases[i].live);
  return {
    measuredAt: meta.measuredAt,
    model: meta.model,
    runsPerCase,
    expected: { total: rows.filter((r) => r.expected !== null).length, exact: count("exact"), safeMiss: count("safe-miss"), misread: count("misread") },
    mustRefuse: { total: rows.filter((r) => r.expected === null).length, refused: count("refused"), passedThrough: count("passed-through") },
    live: { total: live.length, exact: count("exact", live) },
    costUsd: meta.costUsd,
    rows,
  };
}

/** Muse Spark 1.3 list prices in US dollars per million tokens (docs/meta-api-notes.md, Standard mode). */
export const SPARK_USD_PER_M = { input: 1.25, cachedInput: 0.15, output: 4.25 };

/** What one call cost from its usage (output includes reasoning tokens), or null when the response gave no usage. */
export function usageUsd(usage: unknown): number | null {
  const u = usage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    input_tokens_details?: { cached_tokens?: unknown };
  } | null;
  const input = u?.input_tokens ?? u?.prompt_tokens;
  const output = u?.output_tokens ?? u?.completion_tokens;
  if (typeof input !== "number" || typeof output !== "number") return null;
  const cachedRaw = u?.input_tokens_details?.cached_tokens;
  const cached = typeof cachedRaw === "number" ? Math.min(cachedRaw, input) : 0;
  return ((input - cached) * SPARK_USD_PER_M.input + cached * SPARK_USD_PER_M.cachedInput + output * SPARK_USD_PER_M.output) / 1e6;
}

/**
 * A rough price before any call: about 4 characters a token with the schema counted as input, and an assumed 300
 * reasoning tokens a call plus 45 output tokens a rule. The run itself adds up each response's real usage.
 */
export function estimateUsd(contracts: string[][]): { inputTokens: number; outputTokens: number; usd: number } {
  const tokens = (s: string) => Math.ceil(s.length / 4);
  const schema = tokens(JSON.stringify(TERMS_SCHEMA));
  const inputTokens = contracts.reduce((n, terms) => n + tokens(parseTermsPrompt(terms)) + schema, 0);
  const outputTokens = contracts.reduce((n, terms) => n + 300 + 45 * terms.length, 0);
  return { inputTokens, outputTokens, usd: (inputTokens * SPARK_USD_PER_M.input + outputTokens * SPARK_USD_PER_M.output) / 1e6 };
}
