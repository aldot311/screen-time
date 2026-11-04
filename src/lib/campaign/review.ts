// "Worth a look": reasons a person should watch a video before acting on its verdict, even though every term was
// checked. Muse Spark said an object was blurred or could not tell what it was, a measured number landed close to the
// contract's threshold, where a fraction of a second of tracking (or of an estimated spoken time) decides pay or hold,
// or a disclosure was met only by on-screen text that does not say it is an ad. The verdict is unchanged; these only
// say where the machine was least sure.
import { FPS, type ContractRule, type Segment, type VideoReport } from "@/lib/types";
import { findDisclosures, tokenize } from "@/lib/metrics/mentions";
import { spokenTime } from "@/components/format";

/** How close counts as "near the threshold": within 10% of it, and never less than half a second. */
const NEAR = (needed: number) => Math.max(0.5, needed * 0.1);

const secondsWithin = (segments: Segment[], until: number) =>
  segments.reduce((sum, s) => sum + Math.max(0, Math.min(s.endSec, until) - s.startSec), 0);

const fmt = (n: number) => `${Math.floor(n * 10 + 1e-6) / 10} s`;
const ordinal = (n: number) => `${n}${n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;

/** The measured value and the threshold a timing term compared, when the term is one. `spoken`: the value is an
 *  estimated spoken time. */
function measured(rule: ContractRule, r: VideoReport): { got: number; needed: number; what: string; spoken?: true } | null {
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
    case "mentioned": {
      // "Within the first N s": the mention that decides is the minTimes-th one. Its time is estimated from the word's
      // place in its speech turn, so one near the window's end may really fall on the other side of it.
      if (rule.withinFirstSec === undefined) return null;
      const said = [...(m.mentions ?? [])].sort((a, b) => a.startSec - b.startSec)[Math.max(1, rule.minTimes) - 1];
      if (!said) return null;
      return { got: said.startSec, needed: rule.withinFirstSec, what: rule.minTimes > 1 ? `said a ${ordinal(rule.minTimes)} time at` : "first said at", spoken: true };
    }
    default:
      return null;
  }
}

/** On-screen text that says the video is an ad by itself: a one-word label ("#ad", "Sponsored") or words the spoken
 *  check counts as a disclosure ("THIS IS AN AD"). A caption fragment such as "AN AD" or "NOT AN AD" does not. */
function statesDisclosure(text: string): boolean {
  return tokenize(text).length <= 1 || findDisclosures([{ startMs: 0, endMs: 0, transcript: text }]).length > 0;
}

/**
 * A disclosure term met only by on-screen text that does not say it is an ad, with no disclosure heard: for example a
 * caption "AN AD" cut from the spoken line "even if it wasn't an ad", which the spoken check rightly did not count.
 * Reports keep no transcript, so the flag quotes the text that was read, not the sentence it came from.
 */
function impliedDisclosure(r: VideoReport): string | null {
  const d = r.disclosure;
  const term = (r.terms ?? []).find((t) => t.term.rule?.kind === "disclosed" && t.pass === true);
  if (!term || !d || d.spoken.length || !d.onScreen.length || d.onScreen.some((o) => statesDisclosure(o.text))) return null;
  const shown = [...d.onScreen].sort((a, b) => a.startSec - b.startSec)[0];
  return `“${term.term.text}”: the only disclosure is the on-screen text “${shown.text}”, and none was heard said aloud. Implied, not stated: worth a look.`;
}

export function reviewFlags(r: VideoReport): string[] {
  const flags: string[] = [];
  // First: it decides whether a term is met at all.
  const implied = impliedDisclosure(r);
  if (implied) flags.push(implied);
  for (const t of r.tracks ?? []) {
    if (t.verdict === "unclear") flags.push("Muse Spark could not tell what one tracked object is, so it was not counted.");
    else if (t.verdict === "match" && t.visibility === "blurred") flags.push("Muse Spark saw the product blurred, so a frame or two may be missing.");
  }
  for (const t of r.terms ?? []) {
    if (!t.term.rule || t.pass === null) continue;
    const v = measured(t.term.rule, r);
    if (!v || Math.abs(v.got - v.needed) > NEAR(v.needed)) continue;
    flags.push(
      v.spoken
        ? `“${t.term.text}”: ${v.what} ${spokenTime(v.got)}, against the first ${fmt(v.needed)}. Close either way.`
        : v.what === "first seen at"
          ? `“${t.term.text}”: first seen at ${fmt(v.got)}, against ${fmt(v.needed)}. Close either way.`
          : `“${t.term.text}”: ${fmt(v.got)} ${v.what}, against ${fmt(v.needed)} needed. Close either way.`,
    );
  }
  return flags;
}

/** The first reason to look, in a couple of words for a card: "implied disclosure", "blurred", "unclear object", "near
 *  a threshold". */
export function reviewReason(r: VideoReport): string | null {
  const f = reviewFlags(r)[0];
  if (!f) return null;
  return /Implied, not stated: worth a look\.$/.test(f)
    ? "implied disclosure"
    : /blurred/.test(f)
      ? "blurred"
      : /could not tell/.test(f)
        ? "unclear object"
        : "near a threshold";
}
