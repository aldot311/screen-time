import { describe, expect, it } from "vitest";
import type { TermResult } from "@/lib/types";
import { overrideDraft, revisionRequest } from "./report-decision";

const missed = (text: string, rule: TermResult["term"]["rule"], detail: string, evidence: TermResult["evidence"] = []): TermResult => ({
  term: { text, rule },
  pass: false,
  evidence,
  detail,
});

describe("revisionRequest", () => {
  it("lists each fix with what was asked and what was seen, and links to the first missed moment", () => {
    const note = revisionRequest(
      "@maya",
      [
        missed("Say the brand name at least once", { kind: "mentioned", minTimes: 1 }, "Mentioned 0 times (needs 1 time)."),
        missed("On screen at least 3 seconds in total", { kind: "min_seconds_total", seconds: 3 }, "On screen 2.1 s in total (needs 3 s).", [
          { startSec: 4.26, endSec: 6.3 },
        ]),
      ],
      "https://screen-time.example/campaigns/c/videos/v",
    );
    expect(note).toBe(
      [
        "Hi @maya, thanks for the video. Before we pay, could you send a new cut that fixes these?",
        "- Say the brand name once",
        "  Asked: “Say the brand name at least once”. Seen: Mentioned 0 times (needs 1 time).",
        "- Show the product for at least 3 s in total",
        "  Asked: “On screen at least 3 seconds in total”. Seen: On screen 2.1 s in total (needs 3 s).",
        "",
        "What our check saw, second by second: https://screen-time.example/campaigns/c/videos/v?t=4.2",
        "Thanks!",
      ].join("\n"),
    );
  });

  it("links to the report itself when no missed term has a moment to show", () => {
    expect(revisionRequest("@a", [missed("Say it", { kind: "mentioned", minTimes: 1 }, "Mentioned 0 times.")], "https://x/r")).toContain(
      "second by second: https://x/r\n",
    );
  });
});

describe("overrideDraft", () => {
  it("keeps Save off until a decision is picked and a reason written", () => {
    expect(overrideDraft("pay", null, "the logo is covered", 300)).toEqual({ canSave: false, line: null });
    expect(overrideDraft("pay", "hold", "ab ", 300).canSave).toBe(false);
    expect(overrideDraft("pay", "hold", "   ", 300).canSave).toBe(false);
    expect(overrideDraft("pay", "hold", "x".repeat(501), 300).canSave).toBe(false);
    expect(overrideDraft("hold", "pay", "logo covered", 300).canSave).toBe(true);
  });

  it("shows what changes, before to after, once a decision is picked", () => {
    expect(overrideDraft("hold", "pay", "", 300).line).toBe("Recommendation: Hold $300 → Your decision: Pay $300");
    expect(overrideDraft("pay", "hold", "", 1250).line).toBe("Recommendation: Pay $1,250 → Your decision: Hold $1,250");
    expect(overrideDraft("review", "pay", "", 300).line).toBe("Recommendation: Review → Your decision: Pay $300");
    expect(overrideDraft("hold", "pay", "", null).line).toBe("Recommendation: Hold → Your decision: Pay");
  });

  it("allows picking the recommendation itself, worded as a sign-off", () => {
    expect(overrideDraft("pay", "pay", "watched it, the can is clear", 300)).toEqual({
      canSave: true,
      line: "You sign off on the recommendation: Pay $300",
    });
  });
});
