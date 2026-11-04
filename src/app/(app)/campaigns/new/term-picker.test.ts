import { describe, expect, it } from "vitest";
import { parseTermsPrompt } from "@/lib/pipeline/prompts";
import { DEFAULT_TERMS, mentionWindowLabel, termsFrom, type TermState } from "./term-picker";

const only = (p: Partial<TermState>, on: Partial<TermState["on"]>): TermState => ({
  ...DEFAULT_TERMS,
  ...p,
  on: { total: false, within: false, early: false, mention: false, continuous: false, area: false, disclose: false, ...on },
});

describe("term picker timing cards", () => {
  it("leaves the defaults as they were: the new card is off and the mention has no window", () => {
    expect(DEFAULT_TERMS.on.early).toBe(false);
    expect(DEFAULT_TERMS.mentionWithin).toBe("");
    expect(termsFrom(DEFAULT_TERMS)).toEqual({
      terms: [
        "On screen at least 3 seconds in total",
        "On screen at least 2 seconds within the first 5 seconds",
        "Say the brand name at least once",
        "Disclose the sponsorship (#ad or “sponsored”)",
      ],
      problems: {},
    });
  });

  it("writes a first sighting in the parser's own words for first_seen_before", () => {
    expect(termsFrom(only({}, { early: true }))).toEqual({ terms: ["Product first appears before 3 seconds"], problems: {} });
    expect(termsFrom(only({ early: "1" }, { early: true })).terms).toEqual(["Product first appears before 1 second"]);
    expect(termsFrom(only({ early: "2,5" }, { early: true })).terms).toEqual(["Product first appears before 2.5 seconds"]);
    expect(parseTermsPrompt([])).toContain("- first_seen_before: product first appears before `seconds`.");
  });

  it("adds an opening window to the spoken term only when one is given", () => {
    expect(termsFrom(only({ mentionWithin: "5" }, { mention: true })).terms).toEqual(["Say the brand name at least once within the first 5 seconds"]);
    expect(termsFrom(only({ mention: "2", mentionWithin: "4.5" }, { mention: true })).terms).toEqual([
      "Say the brand name at least 2 times within the first 4.5 seconds",
    ]);
    // Empty (or only spaces) means anywhere in the video, as before.
    expect(termsFrom(only({ mentionWithin: "" }, { mention: true }))).toEqual({ terms: ["Say the brand name at least once"], problems: {} });
    expect(termsFrom(only({ mentionWithin: "  " }, { mention: true }))).toEqual({ terms: ["Say the brand name at least once"], problems: {} });
  });

  it("is a negative control: a zero, empty or unreadable window is refused, never written", () => {
    for (const early of ["0", "", "0.001"]) {
      const r = termsFrom(only({ early }, { early: true }));
      expect(r.terms).toEqual([]);
      expect(r.problems.early).toMatch(/0\.1/);
    }
    for (const mentionWithin of ["0", "0.0", "2.55"]) {
      const r = termsFrom(only({ mentionWithin }, { mention: true }));
      expect(r.terms).toEqual([]);
      expect(r.problems.mention).toMatch(/empty for anywhere/);
    }
    // An unticked card checks nothing, whatever its number says.
    expect(termsFrom(only({ early: "0", mentionWithin: "0" }, {}))).toEqual({ terms: [], problems: {} });
  });

  it("announces the spoken card's window as the term will be written, never a refused number", () => {
    expect(mentionWindowLabel("")).toBe(", anywhere in the video");
    expect(mentionWindowLabel(" 5 ")).toBe(" within the first 5 s");
    expect(mentionWindowLabel("2,5")).toBe(" within the first 2.5 s");
    // Negative control: windows termsFrom refuses are not read out as part of the term.
    for (const w of ["0", "2.55", "."]) expect(mentionWindowLabel(w)).toBe(", window not set yet");
  });
});
