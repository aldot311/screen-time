import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_TERMS, termsFrom } from "@/app/(app)/campaigns/new/term-picker";
import type { ContractRule } from "@/lib/types";
import {
  BATCH,
  caseProblems,
  contractRulesRequest,
  estimateUsd,
  evalContracts,
  evalData,
  flatAnswer,
  outcomeOf,
  ruleText,
  RUNS,
  sameRule,
  usageUsd,
  worstOutcome,
  type EvalCase,
} from "./contract-eval";
import { parseTermsPrompt, TERMS_SCHEMA, toContractTerms } from "./prompts";

const cases = JSON.parse(readFileSync(new URL("../../../data/contract-eval/cases.json", import.meta.url), "utf8")) as EvalCase[];
const byId = new Map(cases.map((c) => [c.id, c]));
const get = (id: string) => byId.get(id)!;
// A canned model answer for one term, read through the app's mapper (guards included), as the script reads one.
const read = (c: EvalCase, answer: Record<string, unknown>) =>
  toContractTerms([c.clause], { rules: [{ ...flatAnswer(null), checkable: true, ...answer }] })[0].rule;

describe("contract eval cases", () => {
  it("are the 30 terms the eval was designed with: 21 rules, 9 that must stay unchecked, the 3 live ones", () => {
    expect(cases).toHaveLength(30);
    expect(cases.filter((c) => c.expect !== null)).toHaveLength(21);
    expect(cases.filter((c) => c.expect === null)).toHaveLength(9);
    // The live campaigns' terms, word for word (scripts/build-lacroix.mts).
    expect(cases.filter((c) => c.live).map((c) => c.clause)).toEqual([
      "On screen at least 3 seconds in total",
      "Says LaCroix out loud",
      "Discloses the ad: says it is an ad or sponsored",
    ]);
  });

  it("can all be scored: unique ids, and every expected rule is one the app's mapper can produce", () => {
    expect(caseProblems(cases)).toEqual([]);
    // Negative control: a repeated id, an empty term and an inexpressible rule are each caught.
    const bad: EvalCase[] = [
      get("A1"),
      { ...get("A3"), id: "A1" },
      { ...get("A4"), id: "X1", clause: " " },
      { ...get("D4"), id: "X2", expect: { kind: "mentioned", minTimes: 1.5 } },
    ];
    expect(caseProblems(bad)).toHaveLength(3);
  });

  it("hold the picker's own wording in the picker group", () => {
    const all = termsFrom({ ...DEFAULT_TERMS, on: { ...DEFAULT_TERMS.on, continuous: true, area: true } }).terms;
    expect(all).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"].map((id) => get(id).clause));
  });

  it("never appear in the parser's instructions, so the prompt's examples are not the test", () => {
    const instructions = parseTermsPrompt([]).toLowerCase();
    for (const c of cases) expect(instructions).not.toContain(c.clause.toLowerCase());
  });
});

describe("contract eval scoring", () => {
  it("names each kind of reading", () => {
    const c3 = get("C3").expect; // "Show the can in the first 3 seconds": first seen before 3 s
    expect(outcomeOf(c3, { kind: "first_seen_before", seconds: 3 })).toBe("exact");
    expect(outcomeOf(c3, null)).toBe("safe-miss");
    expect(outcomeOf(c3, { kind: "first_seen_before", seconds: 5 })).toBe("misread");
    expect(outcomeOf(get("E1").expect, null)).toBe("refused");
    expect(outcomeOf(get("E6").expect, { kind: "mentioned", minTimes: 1 })).toBe("passed-through");
  });

  it("scores a known-bad answer as a misread: 'show the can in the first 3 s' read as 3 s on screen within 3 s", () => {
    const got = read(get("C3"), { kind: "min_seconds_within", seconds: 3, withinFirstSec: 3 });
    expect(got).toEqual({ kind: "min_seconds_within", seconds: 3, withinFirstSec: 3 }); // the mapper keeps it: well formed
    expect(outcomeOf(get("C3").expect, got)).toBe("misread");
    // Every wrong reading the case list records scores as wrong.
    for (const c of cases) {
      for (const m of c.misread ?? []) expect(outcomeOf(c.expect, read(c, flatAnswer(m)))).toBe(c.expect ? "misread" : "passed-through");
    }
  });

  it("lets the guards turn a loosened answer into a refusal or a safe miss", () => {
    expect(outcomeOf(get("E7").expect, read(get("E7"), { kind: "disclosed", withinFirstSec: 3 }))).toBe("refused");
    expect(outcomeOf(get("C1").expect, read(get("C1"), { kind: "mentioned", minTimes: 1, seconds: 5 }))).toBe("safe-miss");
  });

  it("takes the worst of a term's readings", () => {
    expect(worstOutcome(["exact", "exact", "misread", "exact"])).toBe("misread");
    expect(worstOutcome(["exact", "safe-miss", "exact"])).toBe("safe-miss");
    expect(worstOutcome(["safe-miss", "misread"])).toBe("misread");
    expect(worstOutcome(["refused", "passed-through", "refused"])).toBe("passed-through");
    expect(worstOutcome(["exact"])).toBe("exact");
    expect(() => worstOutcome([])).toThrow();
  });

  it("compares rules by value, whatever the key order", () => {
    expect(sameRule({ withinFirstSec: 5, minTimes: 1, kind: "mentioned" } as ContractRule, { kind: "mentioned", minTimes: 1, withinFirstSec: 5 })).toBe(true);
    expect(sameRule({ kind: "mentioned", minTimes: 1, withinFirstSec: 3 }, { kind: "mentioned", minTimes: 1, withinFirstSec: 5 })).toBe(false);
    expect(sameRule({ kind: "mentioned", minTimes: 1 }, { kind: "mentioned", minTimes: 1, withinFirstSec: 5 })).toBe(false);
    expect(sameRule(null, null)).toBe(true);
    expect(sameRule(null, { kind: "disclosed" })).toBe(false);
  });

  it("writes rules in the report's words with exact numbers, so a near miss is visible", () => {
    expect(ruleText({ kind: "min_area", fraction: 0.25, forSeconds: 1 })).toBe("≥ 25% of the frame for ≥ 1 s");
    expect(ruleText({ kind: "min_area", fraction: 0.1, forSeconds: 2 })).toBe("≥ 10% of the frame for ≥ 2 s");
    expect(ruleText({ kind: "mentioned", minTimes: 1, withinFirstSec: 5 })).toBe("brand said ≥ 1× within 0–5 s");
    expect(ruleText({ kind: "min_seconds_within", seconds: 2.95, withinFirstSec: 5 })).toBe("on screen ≥ 2.95 s within 0–5 s");
    expect(ruleText({ kind: "first_seen_before", seconds: 3 })).toBe("first seen before 3 s");
    expect(ruleText(null)).toBe("no checkable rule, so a person checks it");
  });
});

describe("contract eval plan", () => {
  const plan = evalContracts(cases);

  it("reads every term 3 times alone and 3 times inside a 15-term contract: 96 calls", () => {
    expect(RUNS).toBe(3);
    expect(BATCH).toBe(15);
    expect(plan).toHaveLength(96);
    expect(plan.filter((k) => k.ids.length === 1)).toHaveLength(90);
    expect(plan.filter((k) => k.ids.length === 15)).toHaveLength(6);
    for (const c of cases) expect(plan.filter((k) => k.ids.includes(c.id))).toHaveLength(6);
    // A campaign takes at most 20 terms, so a longer contract is still one the app could send.
    expect(Math.max(...plan.map((k) => k.ids.length))).toBeLessThanOrEqual(20);
  });

  it("catches a rule that lands on the wrong term of a longer contract", () => {
    const batch = plan.find((k) => k.ids.length === BATCH)!;
    const answers = batch.ids.map((id, i) => flatAnswer(get(id).expect, i));
    [answers[0].index, answers[2].index] = [2, 0]; // A1 and A3 swapped
    const got = toContractTerms(batch.ids.map((id) => get(id).clause), { rules: answers }).map((t) => t.rule);
    const outcomes = batch.ids.map((id, i) => outcomeOf(get(id).expect, got[i]));
    expect(outcomes.filter((o) => o === "misread")).toHaveLength(2);
    expect([outcomes[0], outcomes[2]]).toEqual(["misread", "misread"]);
    expect(outcomes.filter((o) => o === "exact")).toHaveLength(13);
  });

  it("asks what the app asks: the contract_rules schema, strict, the app's prompt, the default effort", () => {
    expect(contractRulesRequest(["a", "b"])).toEqual({
      name: "contract_rules",
      schema: TERMS_SCHEMA,
      strict: true,
      input: [{ type: "input_text", text: parseTermsPrompt(["a", "b"]) }],
    });
  });

  it("prices the dry run roughly, and a real call from its usage", () => {
    const est = estimateUsd(plan.map((k) => k.ids.map((id) => get(id).clause)));
    expect(est.usd).toBeGreaterThan(0.05);
    expect(est.usd).toBeLessThan(1);
    expect(usageUsd({ input_tokens: 1000, output_tokens: 500 })).toBeCloseTo(0.003375, 9);
    expect(usageUsd({ input_tokens: 1000, output_tokens: 500, input_tokens_details: { cached_tokens: 400 } })).toBeCloseTo(0.002935, 9);
    expect(usageUsd({ prompt_tokens: 1000, completion_tokens: 500 })).toBeCloseTo(0.003375, 9);
    expect(usageUsd(undefined)).toBeNull();
    expect(usageUsd({ input_tokens: "1000", output_tokens: 500 })).toBeNull();
  });
});

describe("contract eval data", () => {
  // Six readings a term, all as expected, except: C3 misread once, D4 never read, the live B2 missed once, E6 passed
  // through once.
  const readings: Record<string, (ContractRule | null)[]> = Object.fromEntries(cases.map((c) => [c.id, Array(6).fill(c.expect)]));
  readings.C3 = [...readings.C3.slice(0, 5), { kind: "min_seconds_within", seconds: 3, withinFirstSec: 3 }];
  readings.D4 = Array(6).fill(null);
  readings.B2 = [null, ...readings.B2.slice(1)];
  readings.E6 = [...readings.E6.slice(0, 5), { kind: "mentioned", minTimes: 1 }];
  const data = evalData(cases, readings, { measuredAt: "2026-11-04", model: "muse-spark-1.3", costUsd: 0.21 });

  it("has exactly the agreed shape, counting each term once, by its worst reading", () => {
    expect(Object.keys(data)).toEqual(["measuredAt", "model", "runsPerCase", "expected", "mustRefuse", "live", "costUsd", "rows"]);
    expect(data).toMatchObject({ measuredAt: "2026-11-04", model: "muse-spark-1.3", runsPerCase: 6, costUsd: 0.21 });
    expect(data.expected).toEqual({ total: 21, exact: 18, safeMiss: 2, misread: 1 });
    expect(data.mustRefuse).toEqual({ total: 9, refused: 8, passedThrough: 1 });
    expect(data.live).toEqual({ total: 3, exact: 2 });
    expect(data.rows).toHaveLength(30);
    for (const r of data.rows) expect(Object.keys(r)).toEqual(["id", "text", "expected", "got", "outcome"]);
  });

  it("keeps every reading on its row", () => {
    expect(data.rows.find((r) => r.id === "C3")).toEqual({
      id: "C3",
      text: "Show the can in the first 3 seconds",
      expected: "first seen before 3 s",
      got: [...Array(5).fill("first seen before 3 s"), "on screen ≥ 3 s within 0–3 s"],
      outcome: "misread",
    });
    expect(data.rows.find((r) => r.id === "E1")).toEqual({
      id: "E1",
      text: "Tag @lacroix in the caption",
      expected: null,
      got: Array(6).fill("no checkable rule, so a person checks it"),
      outcome: "refused",
    });
  });

  it("refuses to score a run where a term is missing readings", () => {
    expect(() => evalData(cases, { ...readings, E9: readings.E9.slice(1) }, { measuredAt: "x", model: "m", costUsd: 0 })).toThrow(/E9/);
    const noA1 = Object.fromEntries(Object.entries(readings).filter(([id]) => id !== "A1"));
    expect(() => evalData(cases, noA1, { measuredAt: "x", model: "m", costUsd: 0 })).toThrow(/A1/);
  });
});
