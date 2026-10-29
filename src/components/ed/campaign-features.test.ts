import { describe, expect, it } from "vitest";
import { parseHandles } from "./campaign-creators";
import { fixWords } from "./report-decision";
import { DEFAULT_TERMS, readNumber, termsFrom } from "@/app/(app)/campaigns/new/term-picker";
import { creatorEntry, START_GRACE_MS, videoPhase } from "./campaign-ui";
import type { VideoEntry } from "@/lib/campaign/types";
import type { TermResult } from "@/lib/types";

describe("parseHandles", () => {
  it("splits on commas, spaces and new lines, adds @ and dedupes any case", () => {
    expect(parseHandles("@maya.films, jon_eats\n@Maya.Films  ;  @ann").handles).toEqual(["@maya.films", "@jon_eats", "@ann"]);
  });
  it("reads handles out of profile links", () => {
    expect(parseHandles("https://www.tiktok.com/@maya.films?lang=en instagram.com/jon.eats/").handles).toEqual(["@maya.films", "@jon.eats"]);
  });
  it("skips things that are not handles", () => {
    const r = parseHandles("@ok, no!pe");
    expect(r.handles).toEqual(["@ok"]);
    expect(r.skipped).toEqual(["no!pe"]);
  });
});

describe("termsFrom", () => {
  it("defaults to 3 s total, 2 s in the first 5 s, say the brand once, disclose", () => {
    expect(termsFrom(DEFAULT_TERMS)).toEqual({
      terms: [
        "On screen at least 3 seconds in total",
        "On screen at least 2 seconds within the first 5 seconds",
        "Say the brand name at least once",
        "Disclose the sponsorship (#ad or “sponsored”)",
      ],
      problems: {},
    });
  });
  it("writes edited numbers and the free-text lines", () => {
    const s = {
      ...DEFAULT_TERMS,
      on: { total: false, within: false, mention: true, continuous: true, area: true, disclose: false },
      mention: "2",
      continuous: "2.5",
      areaPct: "10",
      areaSec: "1",
      ownOn: true,
      own: "First line\n\n  Second line ",
    };
    expect(termsFrom(s).terms).toEqual([
      "Say the brand name at least 2 times",
      "One continuous shot of at least 2.5 seconds",
      "Product fills at least 10% of the frame for 1 second",
      "First line",
      "Second line",
    ]);
  });
  it("flags numbers that cannot work instead of sending them", () => {
    const r = termsFrom({ ...DEFAULT_TERMS, total: "", withinSec: "6", mention: "1.5", ownOn: true, own: " " });
    expect(Object.keys(r.problems).sort()).toEqual(["mention", "own", "total", "within"]);
    expect(r.terms).toEqual(["Disclose the sponsorship (#ad or “sponsored”)"]);
  });
  it("never rounds: 0.001 s, 2.55 s, 1.5% and 0 are refused, 2.50 is written as 2.5", () => {
    expect(readNumber("0.001", "seconds")).toBeNull();
    expect(readNumber("2.55", "seconds")).toBeNull();
    expect(readNumber("0", "seconds")).toBeNull();
    expect(readNumber("0.1", "seconds")).toBe(0.1);
    expect(readNumber("2,50", "seconds")).toBe(2.5);
    expect(readNumber("1.5", "percent")).toBeNull();
    expect(readNumber("0", "percent")).toBeNull();
    expect(readNumber("1", "percent")).toBe(1);
    expect(readNumber("101", "percent")).toBeNull();
    const r = termsFrom({ ...DEFAULT_TERMS, total: "0.001" });
    expect(r.problems.total).toMatch(/0\.1/);
    expect(r.terms.some((t) => t.includes("total"))).toBe(false);
  });
  it("is a negative control: a known-bad percentage never becomes a term", () => {
    const r = termsFrom({ ...DEFAULT_TERMS, on: { ...DEFAULT_TERMS.on, area: true }, areaPct: "140" });
    expect(r.problems.area).toBeTruthy();
    expect(r.terms.some((t) => t.includes("140"))).toBe(false);
  });
});

describe("fixWords", () => {
  const t = (rule: TermResult["term"]["rule"], text = "x"): TermResult => ({ term: { text, rule }, pass: false, evidence: [], detail: "" });
  it("says each missed rule as the fix to ask for", () => {
    expect(fixWords(t({ kind: "min_seconds_within", seconds: 2, withinFirstSec: 5 }))).toBe("show the product for 2 s within the first 5 s");
    expect(fixWords(t({ kind: "mentioned", minTimes: 1 }))).toBe("say the brand name once");
    expect(fixWords(t({ kind: "disclosed" }))).toMatch(/disclose the sponsorship/);
    expect(fixWords(t(null, "Wear the hat"))).toBe("Wear the hat");
  });
});

describe("creator status", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  const video = (p: Partial<VideoEntry>): VideoEntry =>
    ({ id: "v1", campaignId: "c", creator: "@Maya", title: "t", videoUrl: "u", status: "done", step: null, createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", ...p }) as VideoEntry;
  const request = (sentAt: string) => ({ nonce: "n", sentAt, expiresAt: "2026-11-05T00:00:00Z" });

  it("shows a link made after the latest video as sent, with the old video still linked", () => {
    const e = creatorEntry({ handle: "@maya", request: request("2026-10-25T00:00:00Z") }, [video({ status: "failed" })], "c", now);
    expect(e.status).toBe("sent");
    expect(e.href).toBe("/campaigns/c/videos/v1");
  });
  it("shows the video when it came after the link (handles match in any case)", () => {
    const e = creatorEntry({ handle: "@maya", request: request("2026-10-10T00:00:00Z") }, [video({ status: "failed" })], "c", now);
    expect(e.status).toBe("stopped");
  });
  it("marks an expired link as expired", () => {
    expect(creatorEntry({ handle: "@x", request: { ...request("2026-10-01T00:00:00Z"), expiresAt: "2026-10-08T00:00:00Z" } }, [], "c", now).status).toBe("expired");
  });
  it("tells a fresh brand upload (starting) from one that never started (uploaded) and a creator's (waiting)", () => {
    const fresh = new Date(now - 10_000).toISOString();
    const stale = new Date(now - START_GRACE_MS - 1).toISOString();
    expect(videoPhase({ status: "uploaded", updatedAt: fresh }, now)).toBe("starting");
    expect(videoPhase({ status: "uploaded", updatedAt: stale }, now)).toBe("uploaded");
    expect(videoPhase({ status: "uploaded", updatedAt: stale, consent: { at: stale, text: "ok" } }, now)).toBe("waiting");
    expect(creatorEntry({ handle: "@maya" }, [video({ status: "uploaded", updatedAt: stale })], "c", now).status).toBe("uploaded");
  });
});
