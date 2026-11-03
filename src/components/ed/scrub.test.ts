import { describe, expect, it } from "vitest";
import { scrubKey, TOUCH_SLOP, touchIntent } from "./scrub";

describe("scrubKey", () => {
  const d = 12;
  it("moves half a second, one frame with Shift, a second with PageUp/PageDown", () => {
    expect(scrubKey("ArrowRight", false, 4, d)).toBe(4.5);
    expect(scrubKey("ArrowLeft", false, 4, d)).toBe(3.5);
    expect(scrubKey("ArrowRight", true, 4, d)).toBeCloseTo(4 + 1 / 15, 9);
    expect(scrubKey("ArrowLeft", true, 4, d)).toBeCloseTo(4 - 1 / 15, 9);
    expect(scrubKey("PageUp", false, 4, d)).toBe(5);
    expect(scrubKey("PageDown", true, 4, d)).toBe(3);
  });

  it("stops at the ends and jumps to them with Home and End", () => {
    expect(scrubKey("ArrowRight", false, 11.8, d)).toBe(12);
    expect(scrubKey("ArrowLeft", false, 0.2, d)).toBe(0);
    expect(scrubKey("Home", false, 7, d)).toBe(0);
    expect(scrubKey("End", false, 7, d)).toBe(12);
  });

  it("plays or pauses on Space and ignores every other key", () => {
    expect(scrubKey(" ", false, 7, d)).toBe("toggle");
    expect(scrubKey("Enter", false, 7, d)).toBeNull();
    expect(scrubKey("ArrowUp", false, 7, d)).toBeNull();
  });
});

describe("touchIntent", () => {
  it("waits until the finger has moved past the slop", () => {
    expect(touchIntent(0, 0)).toBe("wait");
    expect(touchIntent(TOUCH_SLOP, -TOUCH_SLOP)).toBe("wait");
  });

  it("scrubs on a sideways move and leaves a vertical swipe to the page", () => {
    expect(touchIntent(20, 4)).toBe("seek");
    expect(touchIntent(-20, 12)).toBe("seek");
    expect(touchIntent(3, 30)).toBe("scroll");
    expect(touchIntent(12, -40)).toBe("scroll");
  });

  it("treats a 45° move as a scroll, so a diagonal swipe never jumps the playhead", () => {
    expect(touchIntent(15, 15)).toBe("scroll");
  });
});
