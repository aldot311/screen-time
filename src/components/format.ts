import type { ContractRule, Segment, TermResult, VideoReport } from "@/lib/types";

/** 12.4 -> "0:12.4"; whole minutes for long clips. */
export function timecode(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

export function seconds(sec: number): string {
  return `${sec.toFixed(1)} s`;
}

export function percent(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export type Verdict = "delivered" | "short" | "review" | "pending";

/**
 * One word a manager can act on. Any failed term means the creator fell short; an uncheckable term
 * means a person has to look; only all-pass is "delivered". No terms at all also needs a person.
 */
export function verdictOf(report: VideoReport | undefined): Verdict {
  if (!report) return "pending";
  const terms = report.terms;
  if (terms.some((t) => t.pass === false)) return "short";
  if (!terms.length || terms.some((t) => t.pass === null)) return "review";
  return "delivered";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  delivered: "Delivered",
  short: "Fell short",
  review: "Needs review",
  pending: "Not run",
};

export function termCounts(terms: TermResult[]) {
  return {
    passed: terms.filter((t) => t.pass === true).length,
    failed: terms.filter((t) => t.pass === false).length,
    unchecked: terms.filter((t) => t.pass === null).length,
  };
}

/** The part of the video a term is about, drawn on the strip while the term is hovered. */
export function termWindow(rule: ContractRule | null): Segment | null {
  if (!rule) return null;
  if (rule.kind === "min_seconds_within") return { startSec: 0, endSec: rule.withinFirstSec };
  if (rule.kind === "first_seen_before") return { startSec: 0, endSec: rule.seconds };
  if (rule.kind === "mentioned" && rule.withinFirstSec) return { startSec: 0, endSec: rule.withinFirstSec };
  return null;
}
