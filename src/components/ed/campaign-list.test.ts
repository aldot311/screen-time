import { describe, expect, it } from "vitest";
import type { Row } from "./campaign-list";
import { allIncludes, beyondTabs, inFilter } from "./campaign-list";

type TabRow = Pick<Row, "status" | "replacedBy" | "verdict">;
const done = (verdict: Row["verdict"], replacedBy?: string): TabRow => ({ status: "done", verdict, replacedBy });
const tab = (rows: TabRow[], id: "all" | "delivered" | "short" | "review") => rows.filter((r) => inFilter(r, id)).length;

describe("the campaign filter's counts", () => {
  // The LaCroix campaign as the demo video recorded it: 6 delivered, 3 fell short, Michael K's take waiting to run, and
  // Ash's first take replaced by her re-cut. The tabs read 11 / 6 / 3.
  const recorded: TabRow[] = [
    ...Array.from({ length: 6 }, () => done("delivered")),
    ...Array.from({ length: 3 }, () => done("short")),
    { status: "waiting", verdict: "pending" },
    done("short", "ash-recut"),
  ];

  it("adds up: All is every tab plus what no tab counts", () => {
    const b = beyondTabs(recorded);
    const rest = b.replaced + b.waiting + b.running + b.stopped + b.notRun;
    expect([tab(recorded, "all"), tab(recorded, "delivered"), tab(recorded, "short"), tab(recorded, "review"), rest]).toEqual([11, 6, 3, 0, 2]);
    expect(tab(recorded, "all")).toBe(tab(recorded, "delivered") + tab(recorded, "short") + tab(recorded, "review") + rest);
  });

  it("says what All includes beyond the tabs", () => {
    expect(allIncludes(beyondTabs(recorded))).toBe("All includes 1 take replaced by a re-cut and 1 waiting to run.");
    // Live now: Michael K's take has run and delivered.
    expect(allIncludes(beyondTabs([...recorded.slice(0, 9), done("delivered"), done("short", "ash-recut")]))).toBe(
      "All includes 1 take replaced by a re-cut.",
    );
    expect(
      allIncludes(
        beyondTabs([
          done("short", "a"),
          done("delivered", "b"),
          { status: "uploaded", verdict: "pending" },
          { status: "running", verdict: "pending" },
          { status: "starting", verdict: "pending" },
          { status: "failed", verdict: "pending" },
          done("pending"),
        ]),
      ),
    ).toBe("All includes 2 takes replaced by re-cuts, 1 waiting to run, 2 running, 1 stopped and 1 not run.");
  });

  it("says nothing when the tabs add up to All", () => {
    expect(allIncludes(beyondTabs([done("delivered"), done("short"), done("review")]))).toBeNull();
  });
});
