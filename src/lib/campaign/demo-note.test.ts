import { describe, expect, it } from "vitest";
import { DEMO_NOTE, isDemoCampaign } from "./demo-note";
import { SHOWCASE_CAMPAIGN } from "./showcase";
import { TRY_ID } from "./try";

describe("isDemoCampaign", () => {
  it("is true for the showcase campaign and the sample run's campaign, by their own constants", () => {
    expect(isDemoCampaign(SHOWCASE_CAMPAIGN)).toBe(true);
    expect(isDemoCampaign(TRY_ID)).toBe(true);
  });

  it("is false for any other campaign, including look-alike ids", () => {
    for (const id of ["alani-nu-fall", "preview", "try-a-sample", `${SHOWCASE_CAMPAIGN}-2`, "", "LACROIX-STRAWBERRY-PEACH"]) {
      expect(isDemoCampaign(id)).toBe(false);
    }
  });
});

describe("DEMO_NOTE", () => {
  it("says who runs the test campaign and that the brands shown are not involved", () => {
    expect(DEMO_NOTE).toBe(
      "A test campaign run by Screen-Time with friends, who agreed to be shown. Not affiliated with, sponsored or endorsed by LaCroix or Poppi; their names and cans belong to their owners.",
    );
  });
});
