import { describe, expect, it } from "vitest";
import checklist from "../../../data/labels/lacroix/checklist.json";
import { checkedByLine, checklistFor, localDay } from "./labels";

describe("checkedByLine", () => {
  it("records the name, the checker's local date and how it was checked", () => {
    // 22:30 on Nov 3 where the checker is: still Nov 3, whatever the UTC date is.
    const evening = new Date(2026, 10, 3, 22, 30);
    expect(localDay(evening)).toBe("2026-11-03");
    expect(checkedByLine("  Aldo Tile ", evening)).toBe("Aldo Tile, 2026-11-03, frame by frame in /label");
  });

  it("is never mistaken for a Claude pass by scripts/accuracy.mts", () => {
    expect(checkedByLine("Aldo Tile")).not.toMatch(/^claude\b/i);
  });
});

describe("checklistFor", () => {
  it("adds every range end, 3 frames either side, inside the clip, sorted with the saved frames", () => {
    const items = checklistFor([{ frames: [136, 147], note: "saved" }], [[1, 100], [147, 200]], 202);
    expect(items.map((i) => i.frames)).toEqual([
      [0, 4],
      [97, 103],
      [136, 147],
      [144, 150],
      [197, 201],
    ]);
  });

  it("holds the frames the brief names for each clip", () => {
    const frames = (id: string) => (checklist.clips as Record<string, { frames: number[] }[]>)[id].map((i) => i.frames);
    expect(frames("lacroix/lc-1-michael")).toEqual([[136, 147]]);
    expect(frames("lacroix/lc-6-michael")).toEqual([[109, 115], [192, 200]]);
    expect(frames("lacroix/lc-1-george")).toEqual([[240, 250]]);
    expect(frames("lacroix/lc-12-aldo")).toEqual([[180, 182], [255, 257]]);
    expect(frames("lacroix/lc-2-jamal")).toEqual([[216, 216], [320, 320], [386, 386], [459, 461], [500, 500]]);
    expect(frames("lacroix/lc-7a-ash")).toEqual([[18, 18]]);
  });
});
