// What the labelling tool (/label) writes and shows, kept apart from the page so it can be tested: who checked a clip
// and when, and which frames to step through before saying so. Safe in the browser (no Node imports).

/** Today's date where the checker is (not UTC: an evening check in New York is still that day), as YYYY-MM-DD. */
export function localDay(d: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The checkedBy line a person's check records: "Aldo Tile, 2026-11-04, frame by frame in /label". */
export function checkedByLine(name: string, d: Date = new Date()): string {
  return `${name.trim()}, ${localDay(d)}, frame by frame in /label`;
}

/** Frames to look at, first to last (inclusive), and why. */
export interface CheckItem {
  frames: number[];
  note: string;
}

/**
 * The checklist for one clip: the saved frames (data/labels/lacroix/checklist.json, where the drafted labels and the
 * runs disagree) and every range end, 3 frames either side, from the ranges as they are now. Sorted by first frame.
 */
export function checklistFor(saved: CheckItem[], ranges: [number, number][], frameCount: number): CheckItem[] {
  const last = frameCount > 0 ? frameCount - 1 : Infinity;
  const around = (f: number, note: string): CheckItem => ({ frames: [Math.max(0, f - 3), Math.min(last, f + 3)], note });
  const ends = ranges.flatMap(([a, b]) => [around(a, `A range starts at ${a}.`), around(b, `A range ends at ${b}.`)]);
  return [...saved, ...ends].sort((x, y) => x.frames[0] - y.frames[0] || (x.frames.at(-1) ?? 0) - (y.frames.at(-1) ?? 0));
}

/** How a clip says it is an ad, as a person heard and saw it. */
export const DISCLOSURES = [
  { value: "said", label: "Said out loud" },
  { value: "shown", label: "Shown on screen" },
  { value: "both", label: "Said and shown" },
  { value: "implied", label: "Only implied" },
  { value: "none", label: "None" },
] as const;

export type DisclosureLabel = (typeof DISCLOSURES)[number]["value"];
