import { describe, expect, it } from "vitest";
import { findDisclosures, findMentions, tokenize } from "./mentions";

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

describe("findDisclosures", () => {
  const said = (text: string) => findDisclosures([turn(text)]).map((m) => m.text);

  it("finds disclosure statements", () => {
    const cases: [string, string[]][] = [
      ["#ad", ["ad"]],
      ["Loving this drink #ad #sponsored", ["ad", "sponsored"]],
      ["hashtag ad, hashtag sponsored", ["hashtag ad", "hashtag sponsored"]],
      ["This is an ad.", ["This is an ad"]],
      ["this video is an ad for Alani", ["this video is an ad"]],
      ["Just so you know, it's a paid ad", ["it's a paid ad"]],
      ["Ad. Okay so today", ["Ad"]],
      ["Sponsored by Alani. Ad!", ["Sponsored by", "Ad"]],
      ["This is sponsored, guys", ["This is sponsored"]],
      ["this post is paid sponsored content", ["this post is paid sponsored"]],
      ["a paid partnership with Alani", ["paid partnership"]],
      ["I partnered with Alani", ["partnered with"]],
      ["made in partnership with Alani", ["in partnership with"]],
      ["thanks to Alani Nu for sponsoring this video", ["thanks to Alani Nu for sponsoring"]],
      ["Thank you so much Alani for sponsoring", ["Thank you so much Alani for sponsoring"]],
      ["This is a sponsored video", ["This is a sponsored"]],
      ["this post is a paid sponsored one", ["this post is a paid sponsored"]],
    ];
    for (const [text, want] of cases) expect(said(text), text).toEqual(want);
  });

  it("ignores denials, passing uses and look-alike words", () => {
    for (const text of [
      // The four the review named.
      "This is not sponsored", "this isn't an ad", "no ads", "I saw an ad",
      // Other denials: a negation up to three words before, in the same sentence.
      "this was never sponsored by anyone", "not a paid partnership", "I'm not partnered with them", "without an ad, this is great",
      // Passing uses.
      "I skipped the ad", "that sponsored post was bad", "an ad came on", "the ad was loud", "ads everywhere", "I saw a paid ad",
      // Words that contain or resemble them.
      "add it to the cart", "I had one", "I made this", "advert", "advertising", "adidas", "a d", "A.D. 2020",
      "ad-free plan", "This is an ad-free video", "it's a sponsored-content-free zone", "my dad", "bad", "sponsor", "sponsorship", "partner", "partnership", "paid for it", "thanks for watching",
    ]) {
      expect(said(text), text).toEqual([]);
    }
  });

  it("does not let a negation in the previous sentence cancel a disclosure", () => {
    expect(said("No way. This is an ad.")).toEqual(["This is an ad"]);
  });

  it("times a disclosure by word position, like a mention", () => {
    expect(findDisclosures([turn("Ad. this is great", 0, 4000)])).toEqual([{ startSec: 0, endSec: 1, text: "Ad" }]);
  });
});
