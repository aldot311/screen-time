import { FPS, type ContractRule, type Segment, type TermResult, type VideoMetrics, type VideoReport } from "@/lib/types";

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

/**
 * A run error in a manager's words: what happened and who acts. Unknown errors pass through unchanged
 * so nothing is hidden.
 */
export function friendlyError(error: string | undefined): string | undefined {
  if (!error) return error;
  const rules: [RegExp, string][] = [
    [/\b402\b|credit|billing/i, "The Meta API account is out of credits. Aetrai needs to add credits; then run it again. Nothing was charged for this attempt."],
    [/\b401\b|invalid_api_key|not configured|META_MODEL_API_KEY/i, "Screen-Time's Meta API key is missing or no longer valid. Aetrai needs to fix the key; then run it again."],
    [/\b429\b|rate.?limit/i, "Meta's API is busy right now. Wait a minute and run it again."],
    [/cap of \$|CostLimit|would exceed/i, "This video would go over the spending limit set for Screen-Time. Aetrai can raise the limit; then run it again."],
    [/over 200 MB|413|too big/i, "The video is too large (over 200 MB). Upload a shorter or smaller copy."],
    [/\b5\d\d\b|unavailable|overloaded|timed? ?out/i, "Meta's API had a temporary problem. Run it again in a few minutes."],
  ];
  return rules.find(([re]) => re.test(error))?.[1] ?? error;
}

/** Frames to time ranges, bridging the same 2-frame gaps the metrics bridge. */
export function framesToSegments(frames: number[]): Segment[] {
  const sorted = [...new Set(frames)].sort((a, b) => a - b);
  const out: Segment[] = [];
  let start = -1;
  let prev = -1;
  for (const f of sorted) {
    if (start >= 0 && f - prev <= 3) {
      prev = f;
      continue;
    }
    if (start >= 0) out.push({ startSec: start / FPS, endSec: (prev + 1) / FPS });
    start = prev = f;
  }
  if (start >= 0) out.push({ startSec: start / FPS, endSec: (prev + 1) / FPS });
  return out;
}

/** Screen time counted so far while a video plays: the detected frames shown before `sec`, so it ends exactly on
 *  secondsOnScreen. Older reports without visibleFrames fall back to the segments, which include bridged gaps. */
export function countedBefore(metrics: VideoMetrics, sec: number): number {
  if (metrics.visibleFrames) return metrics.visibleFrames.filter((f) => f < sec * FPS).length / FPS;
  return metrics.segments.reduce((sum, s) => sum + Math.max(0, Math.min(s.endSec, sec) - s.startSec), 0);
}
