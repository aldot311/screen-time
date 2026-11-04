import { describe, expect, it } from "vitest";
import type { VerifyVerdict } from "@/lib/types";
import { reportHeadline } from "./report-headline";

const tracks = (...verdicts: VerifyVerdict[]) => verdicts.map((verdict) => ({ verdict }));
const head = (o: Partial<Parameters<typeof reportHeadline>[0]>) =>
  reportHeadline({ verdict: "short", brand: "LaCroix", secondsOnScreen: 0, tracks: [], terms: 3, unchecked: 0, ...o });

describe("reportHeadline", () => {
  it("says why nothing counted, from what was tracked", () => {
    // Aldo's Reel: one can, rejected as a look-alike (a Pamplemousse can).
    expect(head({ tracks: tracks("lookalike") })).toBe("Only a different product was on screen, so nothing counted.");
    expect(head({ tracks: tracks("lookalike", "lookalike") })).toBe("Only different products were on screen, so nothing counted.");
    // George's Reel: one can Muse Spark could not make out.
    expect(head({ tracks: tracks("unclear") })).toBe("LaCroix was never confirmed on screen, so the contract fell short.");
    expect(head({ tracks: tracks("lookalike", "unclear") })).toBe("LaCroix was never confirmed on screen, so the contract fell short.");
    // "Never on screen" only when SAM tracked nothing at all.
    expect(head({ tracks: [] })).toBe("LaCroix was never on screen, so the contract fell short.");
  });

  it("keeps the wording for reports where the product counted", () => {
    expect(head({ secondsOnScreen: 2.1, tracks: tracks("match") })).toBe("LaCroix was on screen, but the contract fell short.");
    expect(head({ verdict: "delivered", secondsOnScreen: 14.5, tracks: tracks("match", "lookalike") })).toBe("LaCroix was on screen, and the contract was met.");
    expect(head({ verdict: "review", secondsOnScreen: 4, tracks: tracks("match"), unchecked: 1 })).toBe("LaCroix was on screen; a person needs to check one term.");
    expect(head({ verdict: "review", secondsOnScreen: 4, tracks: tracks("match"), unchecked: 2 })).toBe("LaCroix was on screen; a person needs to check 2 terms.");
  });

  it("never says the product was on screen when nothing counted", () => {
    expect(head({ verdict: "delivered", tracks: [] })).toBe("LaCroix was never on screen, but the contract was met.");
    expect(head({ verdict: "review", tracks: tracks("unclear"), unchecked: 1 })).toBe("LaCroix was never confirmed on screen; a person needs to check one term.");
  });

  it("covers a report with no terms and one not run", () => {
    expect(head({ verdict: "review", terms: 0 })).toBe("No contract terms were set, so a person needs to check this one.");
    expect(head({ verdict: "pending" })).toBe("Not analyzed yet.");
  });
});
