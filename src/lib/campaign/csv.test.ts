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
    // clip01: frames 18..77 of 167, all three terms checked, the mention term fails (the preview has no audio).
    expect(rows[1]).toBe("@aldo.tile,clip01.mp4 (synthetic preview),done,4,35.9,1.2,4,56.2,0,3,0,0,0,0");
    expect(rows[2]).toBe('@aldo.tile,"a, b",uploaded,,,,,,,,,,,');
  });
});
