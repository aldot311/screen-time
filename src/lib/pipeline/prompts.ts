import type { ContractRule, ContractTerm, PromptAttempt, TrackVerification } from "@/lib/types";

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

export function verifyPrompt(productDescription: string, samPrompt: string, withPhoto = false): string {
  return [
    withPhoto
      ? `The first image is the brand's reference photo of its product. The other images are crops from one creator video of the object a video tracker returned when it searched for "${samPrompt}".`
      : `A video tracker searched for "${samPrompt}" and returned the object shown in these crops from one creator video.`,
    `The brand's product is: ${productDescription}.`,
    ...(withPhoto ? [`Compare the crops against the reference photo as well as the description.`] : []),
    `Decide whether the tracked object is that exact product ("match"), a different product of the same kind`,
    `("lookalike", for example another brand's can), or impossible to tell ("unclear").`,
    `Judge color, shape, logo and label text. If the description names no logo, brand mark or label, judge only the`,
    `features it does name (color, shape, material) and never answer "unclear" just because no logo is visible;`,
    `"unclear" is for when the object itself cannot be made out. Visibility: "clear" if the label is readable or the product is`,
    `unmistakable, "partial" if covered or cut off, "blurred" if motion or focus hides it.`,
    `Give a one-sentence reason a brand manager would understand.`,
  ].join(" ");
}

export const SUGGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["visible", "prompt", "reason"],
  properties: {
    visible: { type: "boolean" },
    prompt: { type: "string" },
    reason: { type: "string" },
  },
} as const;

export function suggestPromptText(productDescription: string, attempts: PromptAttempt[]): string {
  const tried = attempts
    .map((a) => `"${a.prompt}" (tracked ${a.objects} object${a.objects === 1 ? "" : "s"}, ${a.matched} of them the product)`)
    .join("; ");
  return [
    `SAM 3.1 is a video segmentation model that finds objects from a short noun phrase naming a common object`,
    `category, like "cup", "bottle", "can", "shoe" or "bag". It searched this creator video for the brand's product,`,
    `${productDescription}, with these prompts and did not find it: ${tried}.`,
    `Look at these frames from the video. Set "visible" to true only if that exact product appears in at least one`,
    `frame. If it does, give in "prompt" one different noun phrase of one to three words, the plainest everyday name`,
    `for the object's shape, that SAM is likelier to recognize (a tumbler held like a cup is a "cup"). Never repeat a`,
    `tried prompt and never use a brand name. If it is not visible, set "prompt" to an empty string.`,
    `Give a one-sentence reason a brand manager would understand.`,
  ].join(" ");
}

/** A usable new prompt from the model's answer, or null: not visible, empty, too long, or already tried. */
export function toSuggestion(output: unknown, tried: string[]): { prompt: string; reason: string } | null {
  const o = output as { visible?: unknown; prompt?: unknown; reason?: unknown } | null;
  if (!o || o.visible !== true || typeof o.prompt !== "string") return null;
  const prompt = o.prompt.trim().toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/\s+/g, " ");
  const words = prompt.split(" ").filter(Boolean).length;
  if (!prompt || words > 3 || tried.some((t) => t.trim().toLowerCase() === prompt)) return null;
  return { prompt, reason: typeof o.reason === "string" ? o.reason : "" };
}

const KINDS = [
  "min_seconds_total",
  "min_seconds_within",
  "min_continuous",
  "min_area",
  "mentioned",
  "first_seen_before",
  "disclosed",
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
    "- disclosed: the creator discloses the sponsorship, e.g. says it is an ad or shows #ad on screen. No numbers.",
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
    case "disclosed":
      return { kind: r.kind };
    default:
      return null;
  }
}

/** Frames Muse Spark reads for an on-screen sponsorship disclosure (the API takes at most 50 images). */
export const DISCLOSURE_FRAMES = 10;
export const MAX_SPARK_IMAGES = 50;
/** Disclosures usually open the video, so these moments are always read (seconds). */
export const DISCLOSURE_OPENING_SEC = [0.5, 1.5, 3];

export const DISCLOSURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["disclosed", "frames"],
  properties: {
    disclosed: { type: "boolean" },
    frames: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "text"],
        properties: {
          index: { type: "integer" },
          text: {
            type: "string",
            description: "The disclosure as overlaid on the video by the creator (caption sticker or burned-in text), never an app UI label",
          },
        },
      },
    },
  },
} as const;

export function disclosurePrompt(frameCount: number): string {
  return [
    `These ${frameCount} images are frames from one creator video file, in order, numbered from 0.`,
    `Does any frame show a sponsorship disclosure as text overlaid on the video by the creator (caption stickers,`,
    `burned-in text): "#ad", "#sponsored", "Ad", "Sponsored" or "#partner"? Only text that is part of the video counts.`,
    `Ignore the product's own packaging and logos, prices, and any other text.`,
    `Set "disclosed" to true only if you can read such a disclosure. For each frame that shows one, give its number in`,
    `"index" and the disclosure exactly as written in "text". If none does, return "disclosed": false and an empty "frames".`,
  ].join(" ");
}

/** The model's answer as on-screen disclosures at the times of the frames it named; anything malformed is dropped. */
export function toOnScreen(output: unknown, frameTimes: number[]): { startSec: number; text: string }[] {
  const o = output as { disclosed?: unknown; frames?: unknown } | null;
  if (!o || o.disclosed !== true || !Array.isArray(o.frames)) return [];
  const seen = new Set<number>();
  const out: { startSec: number; text: string }[] = [];
  for (const f of o.frames as { index?: unknown; text?: unknown }[]) {
    const i = f?.index;
    const text = typeof f?.text === "string" ? f.text.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= frameTimes.length || !text || seen.has(i)) continue;
    seen.add(i);
    out.push({ startSec: frameTimes[i], text });
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}
