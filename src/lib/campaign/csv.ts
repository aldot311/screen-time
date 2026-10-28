// Campaign roll-up as CSV, one row per video.
import type { VideoEntry } from "./types";

export const CSV_HEADER = [
  "creator",
  "title",
  "status",
  "seconds_on_screen",
  "share_of_video_pct",
  "first_seen_s",
  "longest_run_s",
  "prominence",
  "mentions",
  "terms_passed",
  "terms_failed",
  "terms_unchecked",
  "lookalikes_rejected",
  "cost_usd",
];

type Cell = string | number | null;

// A plain handle like "@aldo.tile" cannot be a formula, so it is left as is.
const HANDLE = /^@[\w.]+$/;

/**
 * RFC 4180 quoting, plus a leading apostrophe on text that a spreadsheet would run as a formula
 * (=, +, -, @, tab, CR), since creator names and titles come from uploaders.
 */
export function csvCell(value: Cell): string {
  if (value === null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s) && !HANDLE.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

export function videoRow(v: VideoEntry): Cell[] {
  const r = v.report;
  if (!r) return [v.creator, v.title, v.status, ...Array<Cell>(CSV_HEADER.length - 3).fill(null)];
  const m = r.metrics;
  const count = (pass: boolean | null) => r.terms.filter((t) => t.pass === pass).length;
  return [
    v.creator,
    v.title,
    v.status,
    round(m.secondsOnScreen, 2),
    round(m.shareOfVideo * 100, 1),
    m.firstSeenSec === null ? null : round(m.firstSeenSec, 2),
    round(m.longestRunSec, 2),
    m.prominenceScore,
    m.mentions.length,
    count(true),
    count(false),
    count(null),
    r.tracks.filter((t) => t.verdict === "lookalike").length,
    round(r.cost.usd, 4),
  ];
}

export function campaignCsv(videos: VideoEntry[]): string {
  return [CSV_HEADER, ...videos.map(videoRow)].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
