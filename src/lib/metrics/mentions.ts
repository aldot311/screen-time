import type { Mention } from "@/lib/types";

export interface TranscriptTurn {
  startMs: number;
  endMs: number;
  transcript: string;
}

interface Token {
  norm: string;
  start: number; // offsets into the original transcript
  end: number;
}

/**
 * Find brand mentions in timed transcript turns. Matching is case-insensitive and whole-word, ignoring
 * punctuation, accents and possessives, and treating spaced, hyphenated and joined spellings as the same
 * ("Coca-Cola", "coca cola", "CocaCola"). Turns carry no word timings, so a mention's time is estimated
 * by its word position within the turn. A name that follows another with only a space between is one mention
 * ("La Croix LaCroix": one spoken name the transcript wrote in both spellings); "Nike, Nike" is two.
 */
export function findMentions(turns: TranscriptTurn[], brandTerms: string[]): Mention[] {
  // "&" is spoken as "and" ("H&M" is heard as "H and M"), so match both spellings.
  const spellings = brandTerms.flatMap((t) => (t.includes("&") ? [t, t.replace(/&/g, " and ")] : [t]));
  const terms = [...new Set(spellings.map(joined).filter(Boolean))];
  if (!terms.length) return [];
  const mentions: Mention[] = [];
  for (const turn of turns) {
    const tokens = tokenize(turn.transcript);
    // The previous match in this turn: its first token, and the token after its last.
    let prev: { from: number; to: number } | null = null;
    let i = 0;
    while (i < tokens.length) {
      const length = matchAt(tokens, i, terms);
      if (length === 0) {
        i++;
        continue;
      }
      // Right after the previous name with only a space between: the same name written twice, so that mention grows.
      const again: boolean = prev?.to === i && !turn.transcript.slice(tokens[i - 1].end, tokens[i].start).trim();
      const from: number = again && prev ? prev.from : i;
      if (again) mentions.pop();
      mentions.push(toMention(turn, tokens, from, i + length - from));
      prev = { from, to: i + length };
      i += length;
    }
  }
  return mentions.sort((a, b) => a.startSec - b.startSec);
}

/**
 * One spelling per name, as findMentions matches them, keeping the first of each: "LaCroix" and "La Croix" are the same
 * name to it. Voice Transcribe given both as keywords wrote one spoken "LaCroix" as "La Croix LaCroix".
 */
export function distinctNames(brandTerms: string[]): string[] {
  const seen = new Set<string>();
  return brandTerms.filter((t) => {
    const key = joined(t);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A name as one run of normalized letters: "La Croix", "LaCroix" and "la-croix" are all "lacroix". */
function joined(name: string): string {
  return tokenize(name)
    .map((x) => x.norm)
    .join("");
}

/** Lowercased, accent-free word tokens (combining marks stay inside the word, so decomposed "é" does not split it); hyphens and other punctuation split words, possessives are dropped. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)) {
    const norm = normalizeWord(m[0]);
    if (norm) tokens.push({ norm, start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

function normalizeWord(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]s$/, "")
    .replace(/['’]/g, "");
}

// Length in tokens of the longest term that starts at tokens[i], or 0. Joining whole tokens keeps it whole-word.
function matchAt(tokens: Token[], i: number, terms: string[]): number {
  let best = 0;
  for (const term of terms) {
    let joined = "";
    for (let j = i; j < tokens.length && joined.length < term.length; j++) {
      joined += tokens[j].norm;
      if (joined === term) best = Math.max(best, j - i + 1);
      if (!term.startsWith(joined)) break;
    }
  }
  return best;
}

function toMention(turn: TranscriptTurn, tokens: Token[], i: number, length: number): Mention {
  const durationMs = Math.max(0, turn.endMs - turn.startMs);
  const at = (k: number) => (turn.startMs + (durationMs * k) / tokens.length) / 1000;
  return {
    startSec: at(i),
    endSec: at(i + length),
    text: turn.transcript.slice(tokens[i].start, tokens[i + length - 1].end),
  };
}

/**
 * Spoken sponsorship disclosures (FTC): statements that this video is an ad or sponsored, not any use of the words.
 * Each pattern is a word sequence after tokenize; "a|b" are alternatives and a trailing "?" makes a word optional.
 * IS is "is", or nothing right after a word written with "'s" (tokenize reads "it's" as the token "it").
 */
const toPatterns = (patterns: string[]) => patterns.map((p) => p.split(" "));

/** Patterns that open a clause of their own. A negation inside one stops it matching ("this is not an ad", "this isn't an
 *  ad"), so a negation before one belongs to something else ("that's actually not bad this is an ad"), unless a verb
 *  that takes the clause comes between ("I don't think this is an ad"). */
const CLAUSE_PATTERNS = toPatterns([
  "this|it|that video|post|reel|clip|one? IS an|a paid? ad",
  "this|it|that video|post|reel|clip|one? IS a? paid? sponsored",
]);

/** Patterns without a subject, which a negation up to three words before denies ("not a paid partnership"). */
const PHRASE_PATTERNS = toPatterns(["hashtag ad|sponsored", "sponsored by", "paid partnership", "partnered with", "in partnership with"]);

/** Words that turn a following disclosure into a denial ("this is not sponsored", "no ads"). */
const NEGATIONS = new Set(["not", "no", "isnt", "wasnt", "arent", "werent", "never", "without", "dont", "doesnt", "nt"]);
const NEGATION_WINDOW = 3;
/** Verbs that carry a negation before them onto the clause they take: "I don't think this is an ad", "not saying it's an ad". */
const CLAUSE_VERBS = new Set(["think", "believe", "say", "saying", "said", "mean", "means", "know", "sure"]);
/** "thanks to Alani for sponsoring": how far back from "for sponsoring" the "thanks" may be. */
const THANKS_WINDOW = 8;

/** Tokens `pattern` covers from tokens[i], or -1 when it does not match there. Optional words are tried both ways. */
function matchPattern(tokens: Token[], text: string, i: number, pattern: string[], k = 0): number {
  if (k === pattern.length) return 0;
  const slot = pattern[k];
  const rest = (from: number) => matchPattern(tokens, text, from, pattern, k + 1);
  if (slot === "IS") {
    if (tokens[i]?.norm === "is") {
      const n = rest(i + 1);
      if (n >= 0) return n + 1;
    }
    // "it's", "this's": the previous word carried the verb.
    return i > 0 && /['’]s$/i.test(text.slice(tokens[i - 1].start, tokens[i - 1].end)) ? rest(i) : -1;
  }
  const optional = slot.endsWith("?");
  const words = (optional ? slot.slice(0, -1) : slot).split("|");
  if (tokens[i] && words.includes(tokens[i].norm)) {
    const n = rest(i + 1);
    if (n >= 0) return n + 1;
  }
  return optional ? rest(i) : -1;
}

/**
 * Where a transcript discloses the sponsorship: "#ad", "hashtag ad", "this is an ad", "this video is an ad", "Ad." on
 * its own, "sponsored by", "this is sponsored", "paid partnership", "partnered with", "in partnership with", "thanks to
 * X for sponsoring". Never a word inside another ("add", "had", "made", "advert"), never a passing "I saw an ad" or
 * "no ads", and never a denial: a negation inside the statement ("this is not sponsored", "this isn't an ad") or, for
 * the phrases without a subject, up to three words earlier in the same sentence ("not a paid partnership") cancels it.
 * Timing is estimated by word position, as in findMentions.
 */
export function findDisclosures(turns: TranscriptTurn[]): Mention[] {
  const found: Mention[] = [];
  for (const turn of turns) {
    const text = turn.transcript;
    const tokens = tokenize(text);
    // Sentence number of each token, so a negation in the previous sentence does not count.
    const sentence = tokens.map((t) => (text.slice(0, t.start).match(/[.!?]+/g) ?? []).length);
    const negated = (i: number) => {
      const clause = CLAUSE_PATTERNS.some((p) => matchPattern(tokens, text, i, p) > 0);
      for (let j = Math.max(0, i - NEGATION_WINDOW); j < i; j++) {
        if (sentence[j] !== sentence[i] || !NEGATIONS.has(tokens[j].norm)) continue;
        if (!clause || tokens.slice(j + 1, i).some((t) => CLAUSE_VERBS.has(t.norm))) return true;
      }
      return false;
    };
    const before = (t: Token) => text.slice(0, t.start).trimEnd();
    const after = (t: Token) => text.slice(t.end).trimStart();
    let i = 0;
    while (i < tokens.length) {
      const length = disclosureAt(tokens, i, text, sentence, before, after);
      if (length && !negated(i)) {
        found.push(toMention(turn, tokens, i, length));
        i += length;
      } else i++;
    }
  }
  return found.sort((a, b) => a.startSec - b.startSec);
}

function disclosureAt(
  tokens: Token[],
  i: number,
  text: string,
  sentence: number[],
  before: (t: Token) => string,
  after: (t: Token) => string,
): number {
  const t = tokens[i];
  // A hyphen joins the word into another one ("ad-free", "self-sponsored").
  if (text[t.start - 1] === "-" || text[t.end] === "-") return 0;
  // "#ad", "#sponsored" written into a caption-style transcript.
  if ((t.norm === "ad" || t.norm === "sponsored") && text[t.start - 1] === "#") return 1;
  // "Ad." as a sentence of its own.
  if (t.norm === "ad" && /(^|[.!?:])$/.test(before(t)) && /^($|[.!?])/.test(after(t))) return 1;
  // "thanks to Alani for sponsoring": from "thanks"/"thank" to "sponsoring", within one sentence.
  if (t.norm === "thanks" || t.norm === "thank") {
    for (let j = i + 1; j < Math.min(tokens.length, i + THANKS_WINDOW + 2); j++) {
      if (sentence[j] !== sentence[i]) break;
      if (tokens[j].norm === "sponsoring" && tokens[j - 1].norm === "for") return j - i + 1;
    }
  }
  let best = 0;
  for (const p of [...PHRASE_PATTERNS, ...CLAUSE_PATTERNS]) best = Math.max(best, matchPattern(tokens, text, i, p));
  // The match may end inside a hyphenated word ("this is an ad-free video").
  if (best && text[tokens[i + best - 1].end] === "-") return 0;
  return best;
}
