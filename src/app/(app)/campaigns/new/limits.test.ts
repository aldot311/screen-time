import { describe, expect, it } from "vitest";
import { budget, RUN_MAX_SECONDS } from "@/lib/campaign/runner";
import { aboutDuration, dollars, maxVideoSeconds, OTHER_CALLS_USD, SAM_USD_PER_SECOND } from "./limits";

describe("maxVideoSeconds", () => {
  it("leaves room for the other calls under the per-video cap: about 2 minutes at the default $0.50", () => {
    // $0.50 - $0.11 reserved for Muse Spark and Voice Transcribe, at $0.003 of SAM 3.1 per second (15 fps × $0.0002).
    expect(SAM_USD_PER_SECOND).toBeCloseTo(0.003);
    expect(OTHER_CALLS_USD).toBeCloseTo(0.11);
    expect(maxVideoSeconds(0.5)).toBeCloseTo(130);
    expect(aboutDuration(maxVideoSeconds(0.5))).toBe("about 2 minutes");
  });

  it("is 0 when the cap cannot cover the other calls", () => {
    expect(maxVideoSeconds(0.05)).toBe(0);
  });

  it("matches the cap and time limit the runner actually applies", () => {
    const saved = process.env.SCREEN_TIME_MAX_USD_PER_VIDEO;
    delete process.env.SCREEN_TIME_MAX_USD_PER_VIDEO;
    try {
      expect(budget().maxUsdPerRun).toBe(0.5);
    } finally {
      if (saved !== undefined) process.env.SCREEN_TIME_MAX_USD_PER_VIDEO = saved;
    }
    expect(RUN_MAX_SECONDS).toBe(300);
  });
});

describe("aboutDuration", () => {
  it("rounds down, to the half minute from a minute up", () => {
    expect(aboutDuration(130)).toBe("about 2 minutes");
    expect(aboutDuration(179)).toBe("about 2½ minutes");
    expect(aboutDuration(60)).toBe("about 1 minute");
    expect(aboutDuration(95)).toBe("about 1½ minutes");
    expect(aboutDuration(47)).toBe("about 45 seconds");
    expect(aboutDuration(2)).toBe("about 5 seconds");
  });

  it("formats dollars to the cent", () => {
    expect(dollars(0.5)).toBe("$0.50");
  });
});
