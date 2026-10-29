// Campaign roll-up as CSV, one row per video.
import { disclosureWhere } from "@/lib/metrics/rules";
import type { VideoReport } from "@/lib/types";
import { verdictOf } from "@/components/format";
import { decisionOf, feeFor } from "./money";
import type { Campaign, VideoEntry } from "./types";

type Fees = Pick<Campaign, "fee" | "creators">;

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
  "disclosed",
  "disclosed_where",
  "product_photo_used",
  "recommendation",
  "fee_usd",
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

export function videoRow(v: VideoEntry, fees: Fees = {}): Cell[] {
  const r = v.report;
  if (!r) return [v.creator, v.title, v.status, ...Array<Cell>(CSV_HEADER.length - 3).fill(null)];
  const decision = v.status === "done" ? decisionOf(verdictOf(r)) : null;
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
    ...disclosureCells(r),
    r.usedProductPhoto ? "yes" : "no",
    decision,
    decision ? feeFor(fees, v.creator) : null,
  ];
}

/** "yes" / "no" / "not checked" (older reports, a campaign with no disclosure term, or nothing said and the frame
 *  check failed), and where it was disclosed. */
function disclosureCells(r: VideoReport): [Cell, Cell] {
  const d = r.disclosure;
  if (!d) return ["not checked", null];
  if (d.spoken.length || d.onScreen.length) return ["yes", disclosureWhere(d)];
  return d.onScreenChecked === false ? ["not checked", null] : ["no", null];
}

/** One row per video; `fees` (the campaign) adds what each recommendation pays or holds. */
export function campaignCsv(videos: VideoEntry[], fees: Fees = {}): string {
  return [CSV_HEADER, ...videos.map((v) => videoRow(v, fees))].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
