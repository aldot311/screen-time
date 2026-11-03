// The landing page's look-alike cards: every object Muse Spark judged in the showcase's look-alike picks, rejected ones
// first. It reads whatever picks loadShowcase() returns besides the hero (one pick or several, under any key), so the
// cards follow lib/campaign/showcase.ts without naming a clip here; with no picks the section is left out.
import type { Showcased } from "@/lib/campaign/showcase";

type Track = Showcased["video"]["report"]["tracks"][number];

export interface VerdictCardData {
  show: Showcased;
  track: Track;
  /** The pick's plain name for the object, or what Muse Spark decided when the pick has none. */
  name: string;
}

export function isShowcased(x: unknown): x is Showcased {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<Showcased>;
  return typeof s.href === "string" && !!s.video && Array.isArray(s.video.report?.tracks);
}

/** Every pick in a loadShowcase() result except the hero, in the order they appear. */
export function lookalikePicks(showcase: object): Showcased[] {
  return Object.entries(showcase)
    .filter(([key]) => key !== "hero")
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter(isShowcased);
}

/** Rejected objects first (the point of the section), then the counted product beside them; each object once. */
export function lookalikeCards(showcase: object): VerdictCardData[] {
  const seen = new Set<string>();
  const cards: VerdictCardData[] = [];
  for (const show of lookalikePicks(showcase)) {
    for (const track of show.video.report.tracks) {
      const key = `${show.video.campaignId}/${show.video.id}/${track.objectId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = show.names[track.objectId] ?? (track.verdict === "match" ? "The brand’s product" : track.verdict === "unclear" ? "Unclear object" : "Look-alike");
      cards.push({ show, track, name });
    }
  }
  const rank = (c: VerdictCardData) => (c.track.verdict === "match" ? 1 : 0);
  return cards.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map(({ c }) => c);
}
