// "Worth a look": reasons a person should watch a video before acting on its verdict, even though every term was
// checked. Muse Spark said an object was blurred or could not tell what it was, or a measured number landed close to
// the contract's threshold, where a fraction of a second of tracking decides pay or hold. The verdict is unchanged;
// these only say where the machine was least sure.
import { FPS, type ContractRule, type Segment, type VideoReport } from "@/lib/types";

/** How close counts as "near the threshold": within 10% of it, and never less than half a second. */
const NEAR = (needed: number) => Math.max(0.5, needed * 0.1);

const secondsWithin = (segments: Segment[], until: number) =>
  segments.reduce((sum, s) => sum + Math.max(0, Math.min(s.endSec, until) - s.startSec), 0);

const fmt = (n: number) => `${Math.floor(n * 10 + 1e-6) / 10} s`;

/** The measured value and the threshold a timing term compared, when the term is one. */
function measured(rule: ContractRule, r: VideoReport): { got: number; needed: number; what: string } | null {
  const m = r.metrics;
  switch (rule.kind) {
    case "min_seconds_total":
      return { got: m.secondsOnScreen, needed: rule.seconds, what: "on screen in total" };
    case "min_seconds_within": {
      // The frames actually detected, as the contract checker counts them; segments (which bridge short gaps) only
      // for reports from before per-frame data was kept.
      const got = m.visibleFrames
        ? m.visibleFrames.filter((f) => f / FPS < rule.withinFirstSec).reduce((n, f) => n + Math.min(1 / FPS, rule.withinFirstSec - f / FPS), 0)
        : secondsWithin(m.segments ?? [], rule.withinFirstSec);
      return { got, needed: rule.seconds, what: `on screen in the first ${fmt(rule.withinFirstSec)}` };
    }
    case "min_continuous":
      return { got: m.longestRunSec, needed: rule.seconds, what: "in one unbroken shot" };
    case "first_seen_before":
      return m.firstSeenSec === null ? null : { got: m.firstSeenSec, needed: rule.seconds, what: "first seen at" };
    default:
      return null;
  }
}

export function reviewFlags(r: VideoReport): string[] {
  const flags: string[] = [];
  for (const t of r.tracks ?? []) {
    if (t.verdict === "unclear") flags.push("Muse Spark could not tell what one tracked object is, so it was not counted.");
    else if (t.verdict === "match" && t.visibility === "blurred") flags.push("Muse Spark saw the product blurred, so a frame or two may be missing.");
  }
  for (const t of r.terms ?? []) {
    if (!t.term.rule || t.pass === null) continue;
    const v = measured(t.term.rule, r);
    if (!v || Math.abs(v.got - v.needed) > NEAR(v.needed)) continue;
    flags.push(
      v.what === "first seen at"
        ? `“${t.term.text}”: first seen at ${fmt(v.got)}, against ${fmt(v.needed)}. Close either way.`
        : `“${t.term.text}”: ${fmt(v.got)} ${v.what}, against ${fmt(v.needed)} needed. Close either way.`,
    );
  }
  return flags;
}

/** The first reason to look, in a couple of words for a card: "blurred", "unclear object", "near a threshold". */
export function reviewReason(r: VideoReport): string | null {
  const f = reviewFlags(r)[0];
  if (!f) return null;
  return /blurred/.test(f) ? "blurred" : /could not tell/.test(f) ? "unclear object" : "near a threshold";
}
