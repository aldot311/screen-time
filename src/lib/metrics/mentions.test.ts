import { describe, expect, it } from "vitest";
import { findMentions, tokenize } from "./mentions";

const turn = (transcript: string, startMs = 0, endMs = 10_000) => ({ startMs, endMs, transcript });

describe("tokenize", () => {
  it("lowercases, strips accents and possessives, splits on hyphens", () => {
    expect(tokenize("Nike's Café-Bar, OK?").map((t) => t.norm)).toEqual(["nike", "cafe", "bar", "ok"]);
  });

  it("handles curly apostrophes", () => {
    expect(tokenize("Nike’s").map((t) => t.norm)).toEqual(["nike"]);
  });
});

describe("findMentions", () => {
  it("returns nothing for no turns or no terms", () => {
    expect(findMentions([], ["Nike"])).toEqual([]);
    expect(findMentions([turn("Nike")], [])).toEqual([]);
    expect(findMentions([turn("Nike")], ["  ", "!!"])).toEqual([]);
  });

  it("matches case-insensitively with punctuation and possessives", () => {
    const ms = findMentions([turn("I love NIKE. Nike's new shoes, nike!")], ["Nike"]);
    expect(ms.map((m) => m.text)).toEqual(["NIKE", "Nike's", "nike"]);
  });

  it("matches a spoken 'and' for an ampersand in the brand name", () => {
    const ms = findMentions([turn("got this at H and M, and some Ben & Jerry's")], ["H&M", "Ben & Jerry's"]);
    expect(ms.map((m) => m.text)).toEqual(["H and M", "Ben & Jerry's"]);
  });

  it("matches whole words only", () => {
    expect(findMentions([turn("Nikesh and nikes went to Nikeland")], ["Nike"])).toEqual([]);
  });

  it("treats spaced, hyphenated and joined spellings as the same", () => {
    const ms = findMentions([turn("Coca-Cola, coca cola and CocaCola")], ["Coca-Cola"]);
    expect(ms.map((m) => m.text)).toEqual(["Coca-Cola", "coca cola", "CocaCola"]);
    expect(findMentions([turn("a red bull please")], ["RedBull"]).map((m) => m.text)).toEqual(["red bull"]);
  });

  it("does not match a partial multi-word brand", () => {
    expect(findMentions([turn("I drank coca water")], ["Coca-Cola"])).toEqual([]);
  });

  it("prefers the longest term at a position and does not double count", () => {
    const ms = findMentions([turn("Red Bull Racing rocks")], ["Red Bull", "Red Bull Racing"]);
    expect(ms.map((m) => m.text)).toEqual(["Red Bull Racing"]);
  });

  it("matches accented brands either way", () => {
    expect(findMentions([turn("I bought Nestle")], ["Nestlé"])).toHaveLength(1);
  });

  it("estimates time from word position within the turn", () => {
    // 4 words over 2..6 s: "nike" is word 2 -> 4.0..5.0 s
    const [m] = findMentions([turn("we wear nike daily", 2000, 6000)], ["nike"]);
    expect(m).toEqual({ startSec: 4, endSec: 5, text: "nike" });
  });

  it("sorts mentions across turns by time", () => {
    const ms = findMentions([turn("nike", 5000, 6000), turn("Nike", 1000, 2000)], ["Nike"]);
    expect(ms.map((m) => m.startSec)).toEqual([1, 5]);
  });

  it("copes with a zero-length turn", () => {
    expect(findMentions([turn("Nike", 3000, 3000)], ["nike"])).toEqual([{ startSec: 3, endSec: 3, text: "Nike" }]);
  });
});

describe("decomposed accents", () => {
  it("keeps a word with a combining mark whole and returns it as spoken", () => {
    expect(tokenize("Pérez").map((t) => t.norm)).toEqual(["perez"]);
    const m = findMentions([turn("I love Nestlé bars", 0, 4000)], ["Nestlé"]);
    expect(m).toEqual([{ startSec: 2, endSec: 3, text: "Nestlé" }]);
  });
});
