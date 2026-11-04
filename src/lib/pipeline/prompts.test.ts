import { describe, expect, it } from "vitest";
import { parseTermsPrompt, toContractTerms } from "./prompts";

// One flat answer as Muse Spark returns it under TERMS_SCHEMA: every field present, unused ones 0.
const raw = (o: Record<string, unknown>) => ({
  index: 0, checkable: true, kind: "min_seconds_total", seconds: 0, withinFirstSec: 0, fraction: 0, forSeconds: 0, minTimes: 0, ...o,
});
const one = (text: string, answer: Record<string, unknown>) => toContractTerms([text], { rules: [raw(answer)] })[0].rule;

describe("toContractTerms guards", () => {
  it("leaves a term for a person when a window or duration lands in a field its kind would drop", () => {
    expect(one("#ad on screen in the first 3 seconds", { kind: "disclosed", withinFirstSec: 3 })).toBeNull();
    expect(one("Say LaCroix in the first 5 seconds", { kind: "mentioned", minTimes: 1, seconds: 5 })).toBeNull();
    expect(one("Hold the can 3 s in one shot within the first 10 s", { kind: "min_continuous", seconds: 3, withinFirstSec: 10 })).toBeNull();
    expect(one("Show the can in the first 3 seconds", { kind: "first_seen_before", seconds: 3, withinFirstSec: 3 })).toBeNull();
    // The same in the other kinds without a window, and a duration on a disclosure.
    expect(one("3 s in the first 10 s", { kind: "min_seconds_total", seconds: 3, withinFirstSec: 10 })).toBeNull();
    expect(one("A quarter of the frame early on", { kind: "min_area", fraction: 0.25, forSeconds: 1, withinFirstSec: 5 })).toBeNull();
    expect(one("#ad held for 3 seconds", { kind: "disclosed", seconds: 3 })).toBeNull();
  });

  it("reads the clean answers for the live campaign's three terms exactly as before", () => {
    expect(one("On screen at least 3 seconds in total", { kind: "min_seconds_total", seconds: 3 })).toEqual({ kind: "min_seconds_total", seconds: 3 });
    expect(one("Says LaCroix out loud", { kind: "mentioned", minTimes: 1 })).toEqual({ kind: "mentioned", minTimes: 1 });
    expect(one("Discloses the ad: says it is an ad or sponsored", { kind: "disclosed" })).toEqual({ kind: "disclosed" });
    // Windows where the kind has room for them are kept.
    expect(one("On screen at least 2 seconds within the first 5 seconds", { kind: "min_seconds_within", seconds: 2, withinFirstSec: 5 })).toEqual({
      kind: "min_seconds_within",
      seconds: 2,
      withinFirstSec: 5,
    });
    expect(one("Say the brand name at least once within the first 5 seconds", { kind: "mentioned", minTimes: 1, withinFirstSec: 5 })).toEqual({
      kind: "mentioned",
      minTimes: 1,
      withinFirstSec: 5,
    });
    expect(one("Product first appears before 3 seconds", { kind: "first_seen_before", seconds: 3 })).toEqual({ kind: "first_seen_before", seconds: 3 });
  });

  it("stays narrow: a stray number in another unused field does not flip a term", () => {
    expect(one("On screen at least 3 seconds in total", { kind: "min_seconds_total", seconds: 3, fraction: 0.5, minTimes: 2 })).toEqual({
      kind: "min_seconds_total",
      seconds: 3,
    });
    expect(one("Says LaCroix out loud", { kind: "mentioned", minTimes: 1, forSeconds: 2 })).toEqual({ kind: "mentioned", minTimes: 1 });
    expect(one("Include #ad", { kind: "disclosed", minTimes: 1 })).toEqual({ kind: "disclosed" });
  });

  it("leaves a term unchecked when two rules claim its index, and maps the others", () => {
    const terms = toContractTerms(["Show the can in the first 3 seconds and say LaCroix in the first 5 seconds", "Include #ad"], {
      rules: [
        raw({ index: 0, kind: "first_seen_before", seconds: 3 }),
        raw({ index: 0, kind: "mentioned", minTimes: 1, withinFirstSec: 5 }),
        raw({ index: 1, kind: "disclosed" }),
      ],
    });
    expect(terms.map((t) => t.rule)).toEqual([null, { kind: "disclosed" }]);
    // Control: the same first rule alone is kept.
    expect(toContractTerms(["x"], { rules: [raw({ index: 0, kind: "first_seen_before", seconds: 3 })] })[0].rule).toEqual({ kind: "first_seen_before", seconds: 3 });
  });
});

describe("parseTermsPrompt", () => {
  const p = parseTermsPrompt(["Show the can in the first 3 seconds"]);

  it("tells the timing kinds apart, with examples", () => {
    expect(p).toContain("with no duration: first_seen_before, `seconds` N.");
    expect(p).toContain("- A duration inside an opening window: min_seconds_within.");
    expect(p).toContain("mentioned, `minTimes` 1 (or the number of times asked for), `withinFirstSec` N. Never put the window in `seconds`.");
    expect(p).toContain('- "Show the bottle in the first 2 seconds" -> first_seen_before, seconds 2.');
    expect(p).toContain('- "Say the brand name in the first 4 seconds" -> mentioned, minTimes 1, withinFirstSec 4.');
  });

  it("names what must stay unchecked, without catching a disclosure", () => {
    for (const s of ["two requirements", "the caption, tags or hashtags", "lighting, tone", "a phrase other than the brand name", "when a disclosure must appear", "the video's length"]) {
      expect(p).toContain(s);
    }
    // #ad and "says it is an ad" are the disclosed kind, not a hashtag or a phrase to refuse.
    expect(p).toContain("(a disclosure such as #ad is disclosed)");
    expect(p).toContain("(saying it is an ad is disclosed)");
    expect(p).toContain("Never split a term into two rules.");
  });

  it("numbers the terms after the instructions", () => {
    expect(p.endsWith("\n\n0. Show the can in the first 3 seconds")).toBe(true);
    expect(parseTermsPrompt(["a", "b"]).endsWith("\n\n0. a\n1. b")).toBe(true);
  });
});
