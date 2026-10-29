import { FPS, type ContractRule, type ContractTerm, type Disclosure, type Mention, type Segment, type TermResult, type VideoMetrics } from "@/lib/types";
import { framesToSegments, type FrameSample } from "./compute";

// Seconds are multiples of 1/15, so float sums can land a hair under a whole-number threshold.
const EPS = 1e-6;

/**
 * Check one contract term against a video's metrics.
 * `frames` (from frameSamples) is needed for min_area (per-frame size) and for a passing min_seconds_within
 * (bridged segments over-count); without it min_area is not checkable and min_seconds_within can only fail.
 * `disclosure` (spoken and on-screen) is needed for "disclosed"; without it that term is not checked.
 */
export function checkTerm(term: ContractTerm, metrics: VideoMetrics, frames?: FrameSample[], disclosure?: Disclosure): TermResult {
  if (!term.rule) {
    return { term, pass: null, evidence: [], detail: "Could not be turned into a checkable rule." };
  }
  const { pass, evidence, detail } = checkRule(term.rule, metrics, frames, disclosure);
  return { term, pass, evidence, detail };
}

export function checkTerms(
  terms: ContractTerm[],
  metrics: VideoMetrics,
  frames?: FrameSample[],
  disclosure?: Disclosure,
): TermResult[] {
  return terms.map((t) => checkTerm(t, metrics, frames, disclosure));
}

type Outcome = Omit<TermResult, "term">;

function checkRule(rule: ContractRule, m: VideoMetrics, frames?: FrameSample[], disclosure?: Disclosure): Outcome {
  switch (rule.kind) {
    case "min_seconds_total": {
      const pass = atLeast(m.secondsOnScreen, rule.seconds);
      return { pass, evidence: m.segments, detail: `On screen ${fmt(m.secondsOnScreen)} s in total (needs ${need(rule.seconds)} s).` };
    }
    case "min_seconds_within": {
      const inWindow = clipSegments(m.segments, rule.withinFirstSec);
      const evidence = inWindow.length ? inWindow : m.segments.slice(0, 1);
      const window = `in the first ${need(rule.withinFirstSec)} s (needs ${need(rule.seconds)} s)`;
      if (frames) {
        const seconds = secondsWithin(frames, rule.withinFirstSec);
        return { pass: atLeast(seconds, rule.seconds), evidence, detail: `On screen ${fmt(seconds)} s ${window}.` };
      }
      // Without per-frame data only an upper bound is known: bridged segments include gaps that were not
      // detected. It can prove a fail, never a pass.
      const upper = Math.min(sumLengths(inWindow), m.secondsOnScreen);
      if (!atLeast(upper, rule.seconds)) {
        return { pass: false, evidence, detail: `On screen at most ${fmt(upper)} s ${window}.` };
      }
      return {
        pass: null,
        evidence,
        detail: `Needs per-frame data, which was not provided: segments allow up to ${fmt(upper)} s ${window}.`,
      };
    }
    case "min_continuous": {
      const longest = longestSegment(m.segments);
      const pass = atLeast(m.longestRunSec, rule.seconds);
      return {
        pass,
        evidence: longest ? [longest] : [],
        detail: `Longest continuous run ${fmt(m.longestRunSec)} s (needs ${need(rule.seconds)} s).`,
      };
    }
    case "min_area": {
      if (!frames) {
        return { pass: null, evidence: [], detail: "Needs per-frame size data, which was not provided." };
      }
      const big = frames.filter((f) => f.areaFraction + EPS >= rule.fraction);
      const seconds = big.length / FPS;
      const pass = atLeast(seconds, rule.forSeconds);
      const evidence = big.length ? framesToSegments(big.map((f) => f.frame)) : closestToArea(frames);
      return {
        pass,
        evidence,
        detail: `At least ${pct(rule.fraction)} of the frame for ${fmt(seconds)} s (needs ${need(rule.forSeconds)} s).`,
      };
    }
    case "mentioned": {
      const within = rule.withinFirstSec;
      const counted = within === undefined ? m.mentions : m.mentions.filter((x) => x.startSec < within);
      const pass = counted.length >= rule.minTimes;
      const evidence = (counted.length ? counted : m.mentions.slice(0, 1)).map(mentionSegment);
      const where = within === undefined ? "" : ` in the first ${need(within)} s`;
      return {
        pass,
        evidence,
        detail: `Mentioned ${times(counted.length)}${where} (needs ${times(rule.minTimes)}).`,
      };
    }
    case "first_seen_before": {
      const first = m.firstSeenSec;
      const pass = first !== null && first < rule.seconds - EPS;
      return {
        pass,
        evidence: m.segments.slice(0, 1),
        detail:
          first === null
            ? `Never seen (needs to appear before ${need(rule.seconds)} s).`
            : `First seen at ${fmt(first)} s (needs to appear before ${need(rule.seconds)} s).`,
      };
    }
    case "disclosed":
      return checkDisclosed(disclosure);
  }
}

/** Disclosed when the creator says it ("ad", "sponsored", "paid partnership") or shows it as text burned into
 *  the video ("#ad", "Sponsored"). The evidence is every such moment; the detail names the first of each. */
function checkDisclosed(d: Disclosure | undefined): Outcome {
  if (!d) return { pass: null, evidence: [], detail: "Not checked: this video was analyzed before disclosure checks." };
  const shown: Segment[] = d.onScreen.map((s) => ({ startSec: s.startSec, endSec: s.startSec + 1 / FPS }));
  const evidence = [...d.spoken.map(mentionSegment), ...shown].sort((a, b) => a.startSec - b.startSec);
  // Said aloud settles it; otherwise a frame check that failed leaves it open rather than "not disclosed".
  if (!d.spoken.length && d.onScreenChecked === false) {
    return { pass: null, evidence: [], detail: "Not checked on screen: the frame check failed" };
  }
  if (!evidence.length) return { pass: false, evidence, detail: "Not disclosed: no “ad” or “sponsored” said or shown on screen" };
  return { pass: true, evidence, detail: `Disclosed: ${disclosureWhere(d)}` };
}

/** "said “ad” at 0:01.2; shown on screen “#ad” at 0:00.5": the first spoken and first on-screen disclosure. */
export function disclosureWhere(d: Disclosure): string {
  const said = d.spoken[0];
  const seen = [...d.onScreen].sort((a, b) => a.startSec - b.startSec)[0];
  return [
    ...(said ? [`said “${said.text}” at ${clock(said.startSec)}`] : []),
    ...(seen ? [`shown on screen “${seen.text}” at ${clock(seen.startSec)}`] : []),
  ].join("; ");
}

/** 1.25 -> "0:01.2", 75.5 -> "1:15.5"; tenths round down like the other details. */
export function clock(sec: number): string {
  const tenths = Math.floor(Math.max(0, sec) * 10 + EPS);
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${minutes}:${rest < 10 ? "0" : ""}${rest.toFixed(1)}`;
}

/** Parts of the segments that fall inside [0, limitSec). */
export function clipSegments(segments: Segment[], limitSec: number): Segment[] {
  return segments
    .filter((s) => s.startSec < limitSec)
    .map((s) => ({ startSec: Math.max(0, s.startSec), endSec: Math.min(s.endSec, limitSec) }))
    .filter((s) => s.endSec > s.startSec);
}

function longestSegment(segments: Segment[]): Segment | undefined {
  let best: Segment | undefined;
  for (const s of segments) if (!best || s.endSec - s.startSec > best.endSec - best.startSec) best = s;
  return best;
}

// For a failed area rule, point at the frame where the product was largest.
function closestToArea(frames: FrameSample[]): Segment[] {
  if (!frames.length) return [];
  const largest = frames.reduce((a, b) => (b.areaFraction > a.areaFraction ? b : a));
  return framesToSegments([largest.frame]);
}

function mentionSegment(x: Mention): Segment {
  return { startSec: x.startSec, endSec: x.endSec };
}

// Detected seconds in [0, limitSec). Each detected frame counts 1/FPS, as in secondsOnScreen; a frame that
// straddles the window end counts only its overlap, so for windows on a frame boundary (any whole second)
// this equals the number of detected frames before the end, divided by FPS.
function secondsWithin(frames: FrameSample[], limitSec: number): number {
  let total = 0;
  for (const f of frames) {
    const start = f.frame / FPS;
    total += Math.max(0, Math.min(start + 1 / FPS, limitSec) - start);
  }
  return total;
}

function sumLengths(segments: Segment[]): number {
  return segments.reduce((t, s) => t + (s.endSec - s.startSec), 0);
}

function atLeast(value: number, needed: number): boolean {
  return value + EPS >= needed;
}

// Rounds down so a near miss never displays as the threshold it missed (2.96 s shows as 2.9, not 3).
function fmt(n: number): string {
  return String(Math.floor(n * 10 + EPS) / 10);
}

// Contract thresholds are shown as written (to 0.01), never rounded down: 0.25 s must not read as "needs 0.2 s".
function need(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 1000) / 10}%`;
}

function times(n: number): string {
  return n === 1 ? "1 time" : `${n} times`;
}
