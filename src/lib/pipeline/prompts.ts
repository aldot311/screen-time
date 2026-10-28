import type { ContractRule, ContractTerm, TrackVerification } from "@/lib/types";

export type VerifyOutput = Omit<TrackVerification, "objectId">;

export const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "visibility", "reason"],
  properties: {
    verdict: { type: "string", enum: ["match", "lookalike", "unclear"] },
    visibility: { type: "string", enum: ["clear", "partial", "blurred"] },
    reason: { type: "string" },
  },
} as const;

export function verifyPrompt(productDescription: string, samPrompt: string): string {
  return [
    `A video tracker searched for "${samPrompt}" and returned the object shown in these crops from one creator video.`,
    `The brand's product is: ${productDescription}.`,
    `Decide whether the tracked object is that exact product ("match"), a different product of the same kind`,
    `("lookalike", for example another brand's can), or impossible to tell ("unclear").`,
    `Judge colour, shape, logo and label text. Visibility: "clear" if the label is readable or the product is`,
    `unmistakable, "partial" if covered or cut off, "blurred" if motion or focus hides it.`,
    `Give a one-sentence reason a brand manager would understand.`,
  ].join(" ");
}

const KINDS = [
  "min_seconds_total",
  "min_seconds_within",
  "min_continuous",
  "min_area",
  "mentioned",
  "first_seen_before",
] as const;

// Flat on purpose: strict structured output rejects oneOf, so every field is always present and the
// ones a kind does not use are 0.
export const TERMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rules"],
  properties: {
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "checkable", "kind", "seconds", "withinFirstSec", "fraction", "forSeconds", "minTimes"],
        properties: {
          index: { type: "integer" },
          checkable: { type: "boolean" },
          kind: { type: "string", enum: [...KINDS] },
          seconds: { type: "number" },
          withinFirstSec: { type: "number" },
          fraction: { type: "number" },
          forSeconds: { type: "number" },
          minTimes: { type: "integer" },
        },
      },
    },
  },
} as const;

export function parseTermsPrompt(terms: string[]): string {
  return [
    "Turn each sponsorship contract term below into one machine-checkable rule about a creator video.",
    "Kinds:",
    "- min_seconds_total: product on screen at least `seconds` in total.",
    "- min_seconds_within: on screen at least `seconds` within the first `withinFirstSec` seconds.",
    "- min_continuous: one continuous appearance of at least `seconds`.",
    "- min_area: product fills at least `fraction` (0-1) of the frame for at least `forSeconds`.",
    "- mentioned: brand said aloud at least `minTimes` times; `withinFirstSec` > 0 limits it to the opening seconds, 0 means anywhere.",
    "- first_seen_before: product first appears before `seconds`.",
    "Set unused numeric fields to 0. If a term cannot be expressed with these kinds, set checkable to false.",
    "Return one rule per term, with `index` the term's number.",
    "",
    ...terms.map((t, i) => `${i}. ${t}`),
  ].join("\n");
}

interface RawRule {
  index: number;
  checkable: boolean;
  kind: (typeof KINDS)[number];
  seconds: number;
  withinFirstSec: number;
  fraction: number;
  forSeconds: number;
  minTimes: number;
}

/** Map the model's flat rules back onto the original terms; anything missing or malformed is unchecked. */
export function toContractTerms(terms: string[], output: unknown): ContractTerm[] {
  const rules = ((output as { rules?: RawRule[] })?.rules ?? []).filter((r) => r && Number.isInteger(r.index));
  return terms.map((text, i) => {
    const raw = rules.find((r) => r.index === i);
    return { text, rule: raw?.checkable ? toRule(raw) : null };
  });
}

function toRule(r: RawRule): ContractRule | null {
  const pos = (n: number) => Number.isFinite(n) && n > 0;
  switch (r.kind) {
    case "min_seconds_total":
      return pos(r.seconds) ? { kind: r.kind, seconds: r.seconds } : null;
    case "min_seconds_within":
      return pos(r.seconds) && pos(r.withinFirstSec)
        ? { kind: r.kind, seconds: r.seconds, withinFirstSec: r.withinFirstSec }
        : null;
    case "min_continuous":
      return pos(r.seconds) ? { kind: r.kind, seconds: r.seconds } : null;
    case "min_area":
      return pos(r.fraction) && r.fraction <= 1 && pos(r.forSeconds)
        ? { kind: r.kind, fraction: r.fraction, forSeconds: r.forSeconds }
        : null;
    case "mentioned":
      return Number.isInteger(r.minTimes) && r.minTimes > 0
        ? { kind: r.kind, minTimes: r.minTimes, ...(pos(r.withinFirstSec) ? { withinFirstSec: r.withinFirstSec } : {}) }
        : null;
    case "first_seen_before":
      return pos(r.seconds) ? { kind: r.kind, seconds: r.seconds } : null;
    default:
      return null;
  }
}
