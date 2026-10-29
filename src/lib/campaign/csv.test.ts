import { describe, expect, it } from "vitest";
import { campaignCsv, csvCell, CSV_HEADER } from "./csv";
import { previewVideos } from "./preview";
import type { VideoEntry } from "./types";

describe("csvCell", () => {
  it("quotes commas, quotes, newlines and edge spaces", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(" padded")).toBe('" padded"');
    expect(csvCell(3.5)).toBe("3.5");
    expect(csvCell(null)).toBe("");
  });

  it("defuses spreadsheet formulas but leaves plain handles alone", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("@aldo.tile")).toBe("@aldo.tile");
    expect(csvCell(-1)).toBe("-1");
  });
});

describe("campaignCsv", () => {
  it("writes a header and one row per video, blank metrics before a report", () => {
    const pending: VideoEntry = { ...previewVideos()[0], status: "uploaded", report: undefined, title: "a, b" };
    const csv = campaignCsv([previewVideos()[0], pending]);
    const rows = csv.trimEnd().split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toBe(CSV_HEADER.join(","));
    // clip01: frames 18..77 of 167, all three terms checked and met.
    // Preview reports predate disclosure checks and product photos.
    expect(rows[1]).toBe("@aldo.tile,clip01.mp4 (synthetic preview),done,4,35.9,1.2,4,56.2,0,3,0,0,0,0,not checked,,no,pay,,pay,");
    expect(rows[2]).toBe('@aldo.tile,"a, b",uploaded,,,,,,,,,,,,,,,,,,');
  });

  it("writes whether and where the sponsorship was disclosed, and whether the product photo was used", () => {
    const v = previewVideos()[0];
    // One creator per row, so no row replaces another.
    let k = 0;
    const withReport = (over: object): VideoEntry => ({ ...v, creator: `@c${k++}`, report: { ...v.report!, ...over } });
    const csv = campaignCsv([
      withReport({
        usedProductPhoto: true,
        disclosure: { spoken: [{ startSec: 1.25, endSec: 1.5, text: "ad" }], onScreen: [{ startSec: 0.5, text: "#ad" }] },
      }),
      withReport({ usedProductPhoto: false, disclosure: { spoken: [], onScreen: [], onScreenChecked: true } }),
      withReport({ disclosure: { spoken: [], onScreen: [], onScreenChecked: false } }),
    ]);
    const rows = csv.trimEnd().split("\r\n");
    expect(CSV_HEADER.slice(-7)).toEqual(["disclosed", "disclosed_where", "product_photo_used", "recommendation", "fee_usd", "final_decision", "override_reason"]);
    expect(rows[1].endsWith(",yes,said “ad” at 0:01.2; shown on screen “#ad” at 0:00.5,yes,pay,,pay,")).toBe(true);
    expect(rows[2].endsWith(",no,,no,pay,,pay,")).toBe(true);
    expect(rows[3].endsWith(",not checked,,no,pay,,pay,")).toBe(true);
  });

  it("adds the recommendation and the creator's fee", () => {
    const v = previewVideos()[0];
    const rows = campaignCsv([v], { fee: 300, creators: [{ handle: v.creator, addedAt: "", fee: 450 }] }).trimEnd().split("\r\n");
    expect(rows[1].endsWith(",pay,450,pay,")).toBe(true);
  });

  it("leaves the recommendation off a video a later one from the same creator replaced", () => {
    const v = previewVideos()[0];
    const older = { ...v, id: "a", createdAt: "2026-10-01T00:00:00Z" };
    const newer = { ...v, id: "b", createdAt: "2026-10-02T00:00:00Z" };
    const rows = campaignCsv([older, newer], { fee: 300 }).trimEnd().split("\r\n");
    expect(rows[1].endsWith(",superseded,,,")).toBe(true);
    expect(rows[2].endsWith(",pay,300,pay,")).toBe(true);
  });

  it("writes a manager's override and its reason beside the recommendation", () => {
    const v = { ...previewVideos()[0], override: { decision: "hold" as const, reason: "Logo hidden by a sticker", at: "2026-10-29T00:00:00Z" } };
    const rows = campaignCsv([v], { fee: 300 }).trimEnd().split("\r\n");
    expect(rows[1].endsWith(",pay,300,hold,Logo hidden by a sticker")).toBe(true);
  });
});
