import { describe, expect, it } from "vitest";
import type { VideoReport } from "@/lib/types";
import { proofFilter, proofWords } from "./proof";

const report = {
  info: { width: 540, height: 960, frameCount: 30, durationSec: 2 },
  tracks: [],
  terms: [{ term: { text: "t", rule: null }, pass: true, evidence: [], detail: "" }],
  metrics: { secondsOnScreen: 1.26, segments: [{ startSec: 0, endSec: 1 }], mentions: [{ startSec: 0.5, endSec: 0.8, text: "Alani" }] },
  detections: [
    { frame: 3, objectId: 0, box: { x1: 10, y1: 20, x2: 109, y2: 219 }, areaFraction: 0.1, centroid: { x: 0, y: 0 }, verdict: "match" },
    { frame: 4, objectId: 1, box: { x1: 0, y1: 0, x2: 9, y2: 9 }, areaFraction: 0.01, centroid: { x: 0, y: 0 }, verdict: "lookalike" },
  ],
} as unknown as VideoReport;

describe("proof clip filter", () => {
  it("draws each box on its own frame, scaled to 720x1280, lime for the product and red for a look-alike", () => {
    const f = proofFilter(report);
    // 540x960 -> 720x1280 is a 4/3 scale with no padding.
    expect(f).toContain("drawbox=x=13:y=27:w=133:h=267:color=0xc5f03a:t=5:enable='eq(n\\,3)'");
    expect(f).toContain("color=0xc2392b:t=3:enable='eq(n\\,4)'");
    // The text arrives as images: top band, footer, then one label per mention, shown while it is said.
    expect(f).toContain("[b0][2:v]overlay=x=0:y=0[b1]");
    expect(f).toContain("[b2][4:v]overlay=x=0:y=1060:enable='between(t\\,0.50\\,1.80)'[m0]");
    expect(f).toMatch(/overlay=x='32\+656\*t\/2\.000'/);
    expect(f).not.toContain("drawtext");
  });

  it("says the verdict and the number", () => {
    const w = proofWords(report, { brand: "Alani Nu", creator: "@maya" });
    expect(w.word).toBe("DELIVERED");
    expect(w.line).toBe("Alani Nu · 1.2 s on screen · @maya");
    expect(w.mention("Alani")).toBe("“Alani” said");
    expect(w.reason).toBe("The contract term was met");
  });
});
