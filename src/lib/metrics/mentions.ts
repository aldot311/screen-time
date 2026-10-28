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
 * by its word position within the turn.
 */
export function findMentions(turns: TranscriptTurn[], brandTerms: string[]): Mention[] {
  // "&" is spoken as "and" ("H&M" is heard as "H and M"), so match both spellings.
  const spellings = brandTerms.flatMap((t) => (t.includes("&") ? [t, t.replace(/&/g, " and ")] : [t]));
  const terms = [...new Set(spellings.map((t) => tokenize(t).map((x) => x.norm).join("")).filter(Boolean))];
  if (!terms.length) return [];
  const mentions: Mention[] = [];
  for (const turn of turns) {
    const tokens = tokenize(turn.transcript);
    let i = 0;
    while (i < tokens.length) {
      const length = matchAt(tokens, i, terms);
      if (length === 0) {
        i++;
        continue;
      }
      mentions.push(toMention(turn, tokens, i, length));
      i += length;
    }
  }
  return mentions.sort((a, b) => a.startSec - b.startSec);
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
