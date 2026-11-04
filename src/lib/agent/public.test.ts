// Which run a report shows: the brand's run to everyone, a visitor's own run only where the address names it.
import { describe, expect, it } from "vitest";
import { replayNotice, shownAgent } from "./public";

const brand = { startedAt: "2026-11-02T09:00:00.000Z", who: "brand" };
const visitor = { startedAt: "2026-11-03T19:14:39.159Z", who: "visitor" };

describe("shownAgent", () => {
  it("shows the brand's run by default, and to the owner even with a run in the address", () => {
    expect(shownAgent({ agent: brand, visitorAgent: visitor }, "public", undefined)).toBe(brand);
    expect(shownAgent({ agent: brand, visitorAgent: visitor }, "owner", visitor.startedAt)).toBe(brand);
  });
  it("shows a visitor the run their address names, and nothing else", () => {
    expect(shownAgent({ agent: brand, visitorAgent: visitor }, "public", visitor.startedAt)).toBe(visitor);
    expect(shownAgent({ agent: brand, visitorAgent: visitor }, "public", "2026-11-03T19:14:39.000Z")).toBe(brand);
    expect(shownAgent({ agent: brand, visitorAgent: visitor }, "public", [visitor.startedAt])).toBe(brand);
    expect(shownAgent({ visitorAgent: visitor }, "public", undefined)).toBeUndefined();
  });
});

describe("replayNotice", () => {
  it("says again only to a visitor who has used their own runs", () => {
    expect(replayNotice("visitor", {}).ask).toBe("To run it again today,");
    expect(replayNotice("day", {}).ask).toBe("To run it yourself today,");
    expect(replayNotice("budget", {}).ask).toBe("To run it yourself,");
    expect(replayNotice(undefined, {}).ask).toBe("To run it yourself,");
  });

  it("names whose run is on screen, and says nothing of a run when the report has none", () => {
    expect(replayNotice("budget", {}).lead).toBe("Above is the brand's own run.");
    expect(replayNotice("budget", { origin: "public" }).lead).toBe("Above is the newest finished run.");
    expect(replayNotice("budget", undefined).lead).toBe("");
  });
});
